/**
 * Reconciliation Helper Functions
 * 
 * This file contains utilities to help identify and fix payment allocation issues
 */

import { toFixed2 } from "./utils";
import type { WorkDetail, TruckPayment } from "@/types";
import { ref, get, Database, update, push } from "firebase/database";

export interface TruckReconciliationReport {
  truckId: string;
  truckNumber: string;
  product: string;
  at20: string | number;
  price: string | number;
  
  // Calculated values
  totalDue: number;
  
  // Payment tracking
  paymentsFound: TruckPayment[];
  totalAllocated: number;
  
  // Discrepancies
  unlinkedPayments: any[]; // Payments that should belong to this truck but aren't linked
  duplicateEntries: string[]; // If truck appears multiple times
  
  // Status
  currentBalance: number;
  expectedBalance: number;
  discrepancy: number;
  
  // Recommendations
  issues: string[];
  fixes: string[];
}

/**
 * Audit a specific truck to find payment allocation issues
 */
export async function auditTruck(
  database: Database,
  truck: WorkDetail,
  owner: string
): Promise<TruckReconciliationReport> {
  const report: TruckReconciliationReport = {
    truckId: truck.id,
    truckNumber: truck.truck_number,
    product: truck.product,
    at20: truck.at20 || 0,
    price: truck.price || 0,
    totalDue: 0,
    paymentsFound: [],
    totalAllocated: 0,
    unlinkedPayments: [],
    duplicateEntries: [],
    currentBalance: 0,
    expectedBalance: 0,
    discrepancy: 0,
    issues: [],
    fixes: []
  };

  // Calculate total due
  if (truck.at20 && truck.price) {
    report.totalDue = toFixed2(parseFloat(String(truck.price)) * parseFloat(String(truck.at20)));
  }

  // Get all truck payments for this truck
  const truckPaymentsRef = ref(database, `truckPayments/${truck.id}`);
  const truckPaymentsSnap = await get(truckPaymentsRef);
  
  if (truckPaymentsSnap.exists()) {
    const payments = Object.entries(truckPaymentsSnap.val()).map(([id, data]: [string, any]) => ({
      id,
      ...data
    }));
    report.paymentsFound = payments;
    report.totalAllocated = toFixed2(payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0));
  }

  // Get all owner payments and check if any should be allocated to this truck
  const ownerPaymentsRef = ref(database, `payments/${owner}`);
  const ownerPaymentsSnap = await get(ownerPaymentsRef);
  
  if (ownerPaymentsSnap.exists()) {
    const allPayments = Object.entries(ownerPaymentsSnap.val()).map(([id, data]: [string, any]) => ({
      id,
      ...data
    }));

    // Check for payments that mention this truck but aren't in truckPayments
    for (const payment of allPayments) {
      if (payment.allocatedTrucks) {
        const truckAllocation = payment.allocatedTrucks.find((a: any) => a.truckId === truck.id);
        if (truckAllocation) {
          // This payment should be linked to this truck
          const isLinked = report.paymentsFound.some(p => p.paymentId === payment.id);
          if (!isLinked) {
            report.unlinkedPayments.push({
              paymentId: payment.id,
              amount: truckAllocation.amount,
              timestamp: payment.timestamp,
              note: payment.note
            });
            report.issues.push(
              `Payment ${payment.id} (${truckAllocation.amount}) is allocated to this truck but not in truckPayments`
            );
            report.fixes.push(
              `Add payment ${payment.id} to truckPayments/${truck.id}`
            );
          }
        }
      }
    }
  }

  // Check for duplicate truck entries
  // NOTE: Same truck can appear multiple times if it's different trips on different dates
  // Only flag as duplicate if it's the SAME trip (same date, same product, same quantity)
  const allWorkDetailsRef = ref(database, `work_details`);
  const allWorkDetailsSnap = await get(allWorkDetailsRef);
  
  if (allWorkDetailsSnap.exists()) {
    const allTrucks = Object.entries(allWorkDetailsSnap.val())
      .map(([id, data]: [string, any]) => ({ id, ...data }))
      .filter((t: any) => 
        t.truck_number === truck.truck_number && 
        t.owner === owner &&
        t.id !== truck.id &&
        // IMPORTANT: Only flag as duplicate if same trip details (same date, product, quantity)
        // Different dates = separate trips (legitimate)
        t.createdAt === truck.createdAt &&
        t.product === truck.product &&
        t.quantity === truck.quantity &&
        t.destination === truck.destination
      );
    
    if (allTrucks.length > 0) {
      report.duplicateEntries = allTrucks.map((t: any) => t.id);
      report.issues.push(
        `Truck ${truck.truck_number} appears ${allTrucks.length + 1} times with IDENTICAL details (same trip)`
      );
      report.fixes.push(
        `Consolidate payments from duplicate entries (same trip) - keep one, delete the other`
      );
    }
  }

  // Calculate balances
  report.currentBalance = toFixed2(report.totalDue - report.totalAllocated);
  
  // Add unlinked payments to expected
  const unlinkedTotal = toFixed2(report.unlinkedPayments.reduce((sum, p) => sum + p.amount, 0));
  report.expectedBalance = toFixed2(report.currentBalance - unlinkedTotal);
  report.discrepancy = toFixed2(report.currentBalance - report.expectedBalance);

  // Summary issues
  if (report.unlinkedPayments.length > 0) {
    report.issues.push(
      `Found ${report.unlinkedPayments.length} unlinked payment(s) totaling $${toFixed2(unlinkedTotal)}`
    );
  }

  if (Math.abs(report.discrepancy) > 0.01) {
    report.issues.push(
      `Balance discrepancy of $${Math.abs(report.discrepancy)} detected`
    );
  }

  return report;
}

/**
 * Audit all trucks for an owner and generate a comprehensive report
 */
export async function auditOwner(
  database: Database,
  owner: string
): Promise<{
  totalTrucks: number;
  trucksWithIssues: number;
  totalDiscrepancy: number;
  reports: TruckReconciliationReport[];
}> {
  // Get all work details for this owner
  const workDetailsRef = ref(database, `work_details`);
  const workDetailsSnap = await get(workDetailsRef);
  
  const reports: TruckReconciliationReport[] = [];
  
  if (workDetailsSnap.exists()) {
    const allTrucks = Object.entries(workDetailsSnap.val())
      .map(([id, data]: [string, any]) => ({ id, ...data }))
      .filter((t: any) => t.owner === owner && t.loaded);
    
    for (const truck of allTrucks) {
      const report = await auditTruck(database, truck, owner);
      reports.push(report);
    }
  }

  const trucksWithIssues = reports.filter(r => r.issues.length > 0).length;
  const totalDiscrepancy = toFixed2(reports.reduce((sum, r) => sum + Math.abs(r.discrepancy), 0));

  return {
    totalTrucks: reports.length,
    trucksWithIssues,
    totalDiscrepancy,
    reports: reports.filter(r => r.issues.length > 0) // Only return trucks with issues
  };
}

/**
 * Fix unlinked payments for a truck
 */
export async function fixUnlinkedPayments(
  database: Database,
  truckId: string,
  unlinkedPayments: Array<{ paymentId: string; amount: number; timestamp: string; note?: string }>
): Promise<void> {
  const updates: { [path: string]: any } = {};

  for (const payment of unlinkedPayments) {
    const paymentRef = push(ref(database, `truckPayments/${truckId}`));
    updates[`truckPayments/${truckId}/${paymentRef.key}`] = {
      amount: payment.amount,
      timestamp: payment.timestamp,
      paymentId: payment.paymentId,
      note: payment.note || "Payment restored during reconciliation",
      restoredAt: new Date().toISOString()
    };
  }

  // Add audit log
  const auditRef = push(ref(database, `audit_logs/reconciliation_fixes`));
  updates[`audit_logs/reconciliation_fixes/${auditRef.key}`] = {
    type: 'fix_unlinked_payments',
    truckId,
    paymentsFixed: unlinkedPayments.length,
    totalAmount: toFixed2(unlinkedPayments.reduce((sum, p) => sum + p.amount, 0)),
    timestamp: new Date().toISOString()
  };

  await update(ref(database), updates);
}

/**
 * Generate a detailed reconciliation report for display
 */
export function generateReconciliationSummary(report: TruckReconciliationReport): string {
  const lines: string[] = [];
  
  lines.push(`Truck: ${report.truckNumber}`);
  lines.push(`Product: ${report.product}`);
  lines.push(`At20: ${report.at20}`);
  lines.push(`Price: $${report.price}`);
  lines.push(`Total Due: $${report.totalDue}`);
  lines.push(`\nPayments Found: ${report.paymentsFound.length}`);
  lines.push(`Total Allocated: $${report.totalAllocated}`);
  lines.push(`Current Balance: $${report.currentBalance}`);
  
  if (report.unlinkedPayments.length > 0) {
    lines.push(`\nUnlinked Payments: ${report.unlinkedPayments.length}`);
    report.unlinkedPayments.forEach(p => {
      lines.push(`  - Payment ${p.paymentId}: $${p.amount} on ${new Date(p.timestamp).toLocaleDateString()}`);
    });
  }
  
  if (report.duplicateEntries.length > 0) {
    lines.push(`\nDuplicate Entries: ${report.duplicateEntries.length}`);
    report.duplicateEntries.forEach(id => {
      lines.push(`  - ${id}`);
    });
  }
  
  if (report.issues.length > 0) {
    lines.push(`\nIssues Found:`);
    report.issues.forEach(issue => {
      lines.push(`  - ${issue}`);
    });
  }
  
  if (report.fixes.length > 0) {
    lines.push(`\nRecommended Fixes:`);
    report.fixes.forEach(fix => {
      lines.push(`  - ${fix}`);
    });
  }
  
  return lines.join('\n');
}
