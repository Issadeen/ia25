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
  
  // If balance is below tolerance threshold, treat it as zero (fully paid)
  if (balance > 0 && balance < BALANCE_TOLERANCE) {
    balance = 0;
  }
  
  const pendingAmount = (balance > 0 && truck.paymentPending) ? balance : 0;
  
  return {
    totalAllocated,
    totalDue,
    balance,
    pendingAmount,
    originalBalance, // Keep the original balance for audit purposes
    toleranceApplied: originalBalance > 0 && originalBalance < BALANCE_TOLERANCE
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
  
  // Apply tolerance - balances below threshold are considered paid
  if (newBalance > 0 && newBalance < BALANCE_TOLERANCE) {
    newBalance = 0;
    
    // Record tolerance write-off
    if (owner) {
      const writeOffUpdates = await recordToleranceWriteOff(database, truck, originalNewBalance, owner);
      Object.assign(updates, writeOffUpdates);
    }
  }
  
  if (newBalance <= 0) {
    updates[`work_details/${truck.id}/paymentStatus`] = 'paid';
    updates[`work_details/${truck.id}/paymentPending`] = false;
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
  const auditRef = push(ref(database, `payment_status_fixes`));
  updates[`payment_status_fixes/${auditRef.key}`] = {
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
