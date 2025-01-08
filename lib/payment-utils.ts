import { toFixed2 } from "./utils";
import type { WorkDetail, TruckPayment } from "@/types";

export interface TruckAllocation {
  totalAllocated: number;
  totalDue: number;
  balance: number;
  pendingAmount: number;
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
    Math.abs(amount - totalAllocated) < 0.01 && // Must allocate full amount
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
