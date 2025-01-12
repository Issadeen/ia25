import { toFixed2 } from "./utils";
import type { WorkDetail, TruckPayment } from "@/types";
import { ref, push, DatabaseReference } from "firebase/database";

// Update existing interfaces
export interface TruckAllocation {
  totalAllocated: number;
  totalDue: number;
  balance: number;
  pendingAmount: number;
}

// Use Firebase Database type
import { Database } from 'firebase/database';

export const getTruckAllocations = (
  truck: WorkDetail,
  truckPayments: { [truckId: string]: TruckPayment[] }
): TruckAllocation => {
  const payments = truckPayments[truck.id] ? Object.values(truckPayments[truck.id]) : [];
  const totalAllocated = toFixed2(payments.reduce((sum, p) => sum + p.amount, 0));
  
  const totalDue = truck.at20 
    ? toFixed2(parseFloat(truck.price) * parseFloat(truck.at20))
    : 0;
  
  const balance = toFixed2(totalDue - totalAllocated);
  const pendingAmount = (balance > 0 && truck.paymentPending) ? balance : 0;
  
  return {
    totalAllocated,
    totalDue,
    balance,
    pendingAmount
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
  updates: { [path: string]: any },
  truck: WorkDetail,
  allocation: { amount: number },
  truckPayments: { [truckId: string]: TruckPayment[] }
) => {
  const { balance } = getTruckAllocations(truck, truckPayments);
  const newBalance = toFixed2(balance - allocation.amount);
  
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
  truckPayments: { [truckId: string]: TruckPayment[] }
) => {
  const { balance, totalAllocated, totalDue } = getTruckAllocations(truck, truckPayments);
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
    if (balance <= 0) {
      updates[`work_details/${truck.id}/paymentStatus`] = 'paid';
      updates[`work_details/${truck.id}/paymentPending`] = false;
      updates[`work_details/${truck.id}/paid`] = true;
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