import { toFixed2 } from "./utils";
import type { WorkDetail, TruckPayment } from "@/types";
import { ref, push, DatabaseReference, update, get } from "firebase/database";

// Small balance tolerance - amounts below this are considered paid
const BALANCE_TOLERANCE = 0.50; // $0.50 threshold

// Update existing interfaces
export interface TruckAllocation {
  totalAllocated: number
  totalDue: number
  balance: number
  pendingAmount: number
  originalBalance?: number // Original balance before tolerance applied
  toleranceApplied?: boolean // Whether tolerance was applied
}

// Use Firebase Database type
import { Database } from 'firebase/database';

export interface PaymentCorrection {
  paymentId: string;
  truckId: string;
  oldAmount: number;
  newAmount: number;
  timestamp: string;
  note: string;
}

// Add the new reconciliation types
export interface BalanceReconciliation {
  id: string;
  ourBalance: number;
  theirBalance: number;
  difference: number;
  timestamp: string;
  status: 'pending' | 'accepted' | 'rejected';
  note?: string;
  createdBy: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export const getTruckAllocations = (
  truck: WorkDetail,
  truckPayments: { [truckId: string]: TruckPayment[] }
): TruckAllocation => {
  const payments = truckPayments[truck.id] ? Object.values(truckPayments[truck.id]) : [];
  const totalAllocated = toFixed2(payments.reduce((sum, p) => sum + p.amount, 0));
  
  const totalDue = truck.at20 
    ? toFixed2(parseFloat(truck.price) * parseFloat(truck.at20))
    : 0;
  
  const originalBalance = toFixed2(totalDue - totalAllocated);
  let balance = originalBalance;
  let toleranceApplied = false;
  
  // ONLY apply tolerance to POSITIVE balances (underpayment)
  // NEVER apply tolerance to NEGATIVE balances (overpayment/credit)
  // Overpayments are legitimate credits that should be tracked
  if (balance > 0 && balance < BALANCE_TOLERANCE) {
    balance = 0;
    toleranceApplied = true;
  }
  
  // Pending amount only applies if there's an actual unpaid balance (positive)
  const pendingAmount = (balance > 0 && truck.paymentPending) ? balance : 0;
  
  return {
    totalAllocated,
    totalDue,
    balance, // Can be negative (credit) or positive (owing) or zero (paid)
    pendingAmount,
    originalBalance, // Keep the original balance for audit purposes
    toleranceApplied
  };
};

export const calculateOptimalAllocation = (
  totalAmount: number,
  trucks: WorkDetail[],
  truckPayments: { [truckId: string]: TruckPayment[] }
): { truckId: string; amount: number; }[] => {
  const totalAvailable = toFixed2(totalAmount);
  const allocations: { truckId: string; amount: number; }[] = [];

  const trucksWithBalances = trucks
    .filter(truck => {
      const { balance } = getTruckAllocations(truck, truckPayments);
      return balance > 0;
    })
    .sort((a, b) => {
      // Sort by creation date first
      const dateA = new Date(a.createdAt || '').getTime();
      const dateB = new Date(b.createdAt || '').getTime();
      return dateA - dateB; // Oldest first
    });

  let remainingAmount = totalAvailable;

  for (const truck of trucksWithBalances) {
    if (remainingAmount <= 0) break;

    const { balance } = getTruckAllocations(truck, truckPayments);
    const allocation = toFixed2(Math.min(balance, remainingAmount));
    
    if (allocation > 0) {
      allocations.push({
        truckId: truck.id,
        amount: allocation
      });
      remainingAmount = toFixed2(remainingAmount - allocation);
    }
  }

  return allocations;
};

export const validatePaymentForm = (
  amount: number,
  allocations: { truckId: string; amount: number; }[]
): boolean => {
  const totalAllocated = toFixed2(allocations.reduce((sum, t) => sum + t.amount, 0));
  
  return (
    amount > 0 && // Must have some amount to allocate
    totalAllocated > 0 && // Must allocate some amount
    totalAllocated <= amount && // Total allocation must not exceed available amount
    allocations.length > 0 // Must select at least one truck
  );
};

export const updatePaymentStatuses = async (
  database: Database,
  updates: { [path: string]: any },
  truck: WorkDetail,
  allocation: { amount: number },
  truckPayments: { [truckId: string]: TruckPayment[] },
  owner?: string
) => {
  const { balance } = getTruckAllocations(truck, truckPayments);
  const originalNewBalance = toFixed2(balance - allocation.amount);
  let newBalance = originalNewBalance;
  let toleranceApplied = false;
  
  // Apply tolerance ONLY for positive balances (underpayment)
  // NEVER apply tolerance to negative balances (credits/overpayment)
  if (newBalance > 0 && newBalance < BALANCE_TOLERANCE) {
    newBalance = 0;
    toleranceApplied = true;
    
    // Record tolerance write-off
    if (owner) {
      const writeOffUpdates = await recordToleranceWriteOff(database, truck, originalNewBalance, owner);
      Object.assign(updates, writeOffUpdates);
    }
  }
  
  // Status logic:
  // - Positive balance (owing) → Due or Pending
  // - Zero balance (exact payment) → Paid
  // - Negative balance (overpaid/credit) → Paid (customer has credit for next load)
  if (newBalance <= 0) {
    updates[`work_details/${truck.id}/paymentStatus`] = 'paid';
    updates[`work_details/${truck.id}/paymentPending`] = false;
    
    // If there's a credit (negative balance), add it to available balance
    if (newBalance < 0 && owner) {
      const creditAmount = toFixed2(Math.abs(newBalance));
      const creditId = `credit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      updates[`owner_credits/${owner}/${creditId}`] = {
        id: creditId,
        truckId: truck.id,
        truckNumber: truck.truck_number,
        amount: creditAmount,
        timestamp: new Date().toISOString(),
        source: 'overpayment',
        status: 'available',
        note: `Credit from overpayment on ${truck.truck_number}`
      };
      
      // Add to balance usage history for tracking
      const historyId = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      updates[`balance_usage/${owner}/${historyId}`] = {
        amount: creditAmount,
        timestamp: new Date().toISOString(),
        type: 'deposit',
        usedFor: [truck.id],
        paymentId: creditId,
        note: `Credit generated from truck ${truck.truck_number} overpayment`
      };
      
      // Update owner available balance - ADD the credit
      const balanceHistoryId = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      updates[`balance_usage/${owner}/${balanceHistoryId}`] = {
        amount: creditAmount,
        timestamp: new Date().toISOString(),
        type: 'deposit',
        usedFor: [],
        paymentId: `overpayment_${creditId}`,
        note: `Overpayment credit from truck ${truck.truck_number}: -${newBalance}`
      };
    }
  } else if (allocation.amount > 0) {
    updates[`work_details/${truck.id}/paymentStatus`] = 'partial';
    updates[`work_details/${truck.id}/paymentPending`] = true;
  }
};

export const syncTruckPaymentStatus = async (
  database: Database,
  truck: WorkDetail,
  truckPayments: { [truckId: string]: TruckPayment[] },
  owner?: string
) => {
  const allocation = getTruckAllocations(truck, truckPayments);
  const { balance, totalAllocated, totalDue, originalBalance, toleranceApplied } = allocation;
  const updates: { [path: string]: any } = {};

  // If status is completed, mark as paid regardless of balance
  if (truck.status === 'completed') {
    updates[`work_details/${truck.id}/paymentStatus`] = 'paid';
    updates[`work_details/${truck.id}/paymentPending`] = false;
    updates[`work_details/${truck.id}/paid`] = true;
    return updates;
  }

  // Reset status first
  updates[`work_details/${truck.id}/status`] = truck.status;
  updates[`work_details/${truck.id}/paymentPending`] = false;
  updates[`work_details/${truck.id}/paymentStatus`] = 'unpaid';
  updates[`work_details/${truck.id}/paid`] = false;

  // If loaded and has payments, update status
  if (truck.loaded) {
    // balance will be 0 if it's below BALANCE_TOLERANCE (handled in getTruckAllocations)
    if (balance <= 0) {
      updates[`work_details/${truck.id}/paymentStatus`] = 'paid';
      updates[`work_details/${truck.id}/paymentPending`] = false;
      updates[`work_details/${truck.id}/paid`] = true;
      
      // If there's a credit (negative balance), add it to available balance
      if (balance < 0 && owner) {
        const creditAmount = toFixed2(Math.abs(balance));
        const creditId = `credit_sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        updates[`owner_credits/${owner}/${creditId}`] = {
          id: creditId,
          truckId: truck.id,
          truckNumber: truck.truck_number,
          amount: creditAmount,
          timestamp: new Date().toISOString(),
          source: 'overpayment',
          status: 'available',
          note: `Credit from overpayment on ${truck.truck_number}`
        };
        
        // Add to balance usage history for tracking
        const historyId = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        updates[`balance_usage/${owner}/${historyId}`] = {
          amount: creditAmount,
          timestamp: new Date().toISOString(),
          type: 'deposit',
          usedFor: [],
          paymentId: creditId,
          note: `Credit from truck ${truck.truck_number} overpayment: -$${toFixed2(Math.abs(balance))}`
        };
      }
      
      // Record tolerance write-off if it was applied
      if (toleranceApplied && originalBalance && owner) {
        const writeOffUpdates = await recordToleranceWriteOff(database, truck, originalBalance, owner);
        Object.assign(updates, writeOffUpdates);
      }
      // Also update status if it was queued
      if (truck.status === 'queued') {
        updates[`work_details/${truck.id}/status`] = 'completed';
      }
    } else if (totalAllocated > 0) {
      updates[`work_details/${truck.id}/paymentStatus`] = 'partial';
      updates[`work_details/${truck.id}/paymentPending`] = true;
      updates[`work_details/${truck.id}/paid`] = false;
    }
  }

  // Add audit log with additional status info
  const timestamp = new Date().toISOString();
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  updates[`payment_status_fixes/${auditId}`] = {
    id: auditId,
    truckId: truck.id,
    truckNumber: truck.truck_number,
    timestamp,
    oldStatus: truck.paymentStatus || 'unknown',
    oldQueueStatus: truck.status,
    newStatus: updates[`work_details/${truck.id}/paymentStatus`],
    newQueueStatus: updates[`work_details/${truck.id}/status`],
    wasCompleted: truck.status === 'completed',
    reason: 'sync_fix',
    totalDue,
    totalPaid: totalAllocated,
    balance
  };

  return updates;
};

// Update existing fixTruckPaymentStatus to use the new sync function
export const fixTruckPaymentStatus = async (
  database: Database,
  truck: WorkDetail,
  truckPayments: { [truckId: string]: TruckPayment[] }
) => {
  return syncTruckPaymentStatus(database, truck, truckPayments);
};

export async function correctPaymentAllocation(
  database: any,
  owner: string,
  correction: PaymentCorrection
) {
  const updates: { [key: string]: any } = {};
  const timestamp = new Date().toISOString();

  // Update truck payment record
  updates[`truckPayments/${correction.truckId}/${correction.paymentId}`] = {
    amount: correction.newAmount,
    timestamp: correction.timestamp,
    correctedAt: timestamp,
    note: correction.note
  };

  // Add correction record
  const correctionRef = push(ref(database, `payment_corrections/${owner}`));
  updates[`payment_corrections/${owner}/${correctionRef.key}`] = {
    ...correction,
    correctedAt: timestamp
  };

  // Update the original payment record to mark it as corrected
  updates[`payments/${owner}/${correction.paymentId}/corrected`] = true;
  updates[`payments/${owner}/${correction.paymentId}/correctedAt`] = timestamp;

  // Add audit log
  const auditRef = push(ref(database, `audit_logs/${owner}`));
  updates[`audit_logs/${owner}/${auditRef.key}`] = {
    type: 'payment_correction',
    timestamp,
    details: correction,
    note: correction.note
  };

  await update(ref(database), updates);
  return updates;
}

export async function getPaymentCorrections(
  database: any,
  owner: string
): Promise<PaymentCorrection[]> {
  const correctionsRef = ref(database, `payment_corrections/${owner}`);
  const snapshot = await get(correctionsRef);
  return snapshot.exists() ? Object.values(snapshot.val()) : [];
}

export async function getReconciliations(
  database: any,
  owner: string,
  month: string
): Promise<BalanceReconciliation[]> {
  const reconciliationsRef = ref(database, `payment_reconciliations/${owner}/${month}`);
  const snapshot = await get(reconciliationsRef);
  return snapshot.exists() ? Object.values(snapshot.val()) : [];
}

export const updateBalanceAfterReconciliation = async (
  database: any,
  owner: string,
  newBalance: number,
  month: string
) => {
  const timestamp = new Date().toISOString();
  const updates: { [path: string]: any } = {};
  
  // Update owner balance
  updates[`owner_balances/${owner}/${month}`] = {
    amount: newBalance,
    lastUpdated: timestamp,
    reconciled: true
  };
  
  // Add balance adjustment record
  const adjustmentRef = push(ref(database, `balance_usage/${owner}`));
  updates[`balance_usage/${owner}/${adjustmentRef.key}`] = {
    amount: newBalance,
    timestamp,
    type: "reconciliation_adjustment",
    note: "Balance adjusted after reconciliation"
  };
  
  await update(ref(database), updates);
  return updates;
};

/**
 * Calculate available balance including prepayments and overpayment credits
 */
export async function getAvailableBalance(
  database: Database,
  owner: string
): Promise<{ prepayment: number; credits: number; total: number }> {
  let prepayment = 0;
  let credits = 0;

  // Get prepayment balance
  const balanceRef = ref(database, `owner_balances/${owner}`);
  const balanceSnap = await get(balanceRef);
  if (balanceSnap.exists()) {
    const balance = balanceSnap.val();
    if (typeof balance === 'object' && balance.amount) {
      prepayment = balance.amount;
    } else if (typeof balance === 'number') {
      prepayment = balance;
    }
  }

  // Get available credits from overpayments
  const creditsRef = ref(database, `owner_credits/${owner}`);
  const creditsSnap = await get(creditsRef);
  if (creditsSnap.exists()) {
    const creditsData = Object.values(creditsSnap.val()) as any[];
    credits = toFixed2(
      creditsData
        .filter((c) => c.status === 'available')
        .reduce((sum, c) => sum + (c.amount || 0), 0)
    );
  }

  return {
    prepayment: toFixed2(prepayment),
    credits: toFixed2(credits),
    total: toFixed2(prepayment + credits)
  };
}

// Record tolerance write-offs for audit purposes
export const recordToleranceWriteOff = async (
  database: Database,
  truck: WorkDetail,
  originalBalance: number,
  owner: string
) => {
  const timestamp = new Date().toISOString();
  const writeOffRef = push(ref(database, `tolerance_writeoffs/${owner}`));
  
  const updates: { [path: string]: any } = {};
  
  updates[`tolerance_writeoffs/${owner}/${writeOffRef.key}`] = {
    truckId: truck.id,
    truckNumber: truck.truck_number,
    product: truck.product,
    originalBalance: toFixed2(originalBalance),
    writtenOffAmount: toFixed2(originalBalance),
    tolerance: BALANCE_TOLERANCE,
    timestamp,
    at20: truck.at20,
    totalDue: truck.at20 ? toFixed2(parseFloat(truck.price) * parseFloat(truck.at20)) : 0,
    note: `Balance below tolerance threshold ($${BALANCE_TOLERANCE}) - auto-forgiven`
  };
  
  // Also add to audit log
  const auditRef = push(ref(database, `audit_logs/${owner}`));
  updates[`audit_logs/${owner}/${auditRef.key}`] = {
    type: 'tolerance_writeoff',
    truckId: truck.id,
    truckNumber: truck.truck_number,
    amount: toFixed2(originalBalance),
    timestamp,
    note: `Small balance write-off: $${toFixed2(originalBalance)}`
  };
  
  await update(ref(database), updates);
  return updates;
};
