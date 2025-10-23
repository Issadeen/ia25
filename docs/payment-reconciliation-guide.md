# Payment Reconciliation Guide

## The Problem

### Original Issue
**Owner**: KDR425B-ZH5348 (PMS)
- **System Shows**: Balance of $27,548.25
- **Owner Claims**: Balance should be $14,512.48  
- **Discrepancy**: $13,035.77

After investigation, the owner was **correct**. This indicates a payment allocation issue in the system.

## Common Causes of Payment Discrepancies

### 1. **Unlinked Payments**
**What it means**: Payments exist in `payments/{owner}` with allocations to specific trucks, but those entries are missing from `truckPayments/{truckId}`.

**How it happens**:
- Payment transaction partially failed mid-update
- Database write interrupted
- Manual payment deletion from truckPayments but not from payments
- Race condition during concurrent updates

**Example**:
```
payments/OWNER_NAME/payment123 = {
  amount: 5000,
  allocatedTrucks: [
    { truckId: "truck456", amount: 5000 }
  ]
}

// BUT truckPayments/truck456 is missing the entry!
// Result: Truck shows $5000 balance but payment was made
```

### 2. **Duplicate Truck Entries**
**What it means**: Same truck number appears multiple times in work_details with different IDs.

**How it happens**:
- Truck made multiple trips
- Manual entry duplication
- Import/sync issues
- System didn't detect existing truck

**Example**:
```
work_details/id1 = { truck_number: "KDR425B", owner: "John", at20: 20, ... }
work_details/id2 = { truck_number: "KDR425B", owner: "John", at20: 25, ... }

// Payments might be split between both entries incorrectly
```

### 3. **Month Filter Excluding Paid Trucks**
**What it means**: The month filter hides fully paid trucks from past months, but their totals still count toward balance calculation.

**Impact**:
- "Total Due" includes all months
- "Total Paid" only counts visible trucks
- Result: Inflated balance

### 4. **Payment Misallocation**
**What it means**: Payment allocated to wrong truck or wrong owner.

**Example**:
```
// Payment meant for Truck A went to Truck B
truckPayments/truckB/payment123 = { amount: 5000 }

// Should be:
truckPayments/truckA/payment123 = { amount: 5000 }
```

## Solution: Reconciliation Audit System

### Features

#### 1. **Owner-Wide Audit**
Scans all trucks for an owner and identifies:
- Total trucks checked
- Number of trucks with issues
- Total discrepancy amount
- List of problematic trucks

**How to use**:
1. Go to owner details page
2. Click "Audit Payments" button (top right of Loaded Trucks table)
3. Wait for audit to complete
4. Review results in dialog

#### 2. **Individual Truck Audit**
Deep analysis of a single truck:
- Financial summary (Total Due, Paid, Balance)
- List of all linked payments
- Unlinked payments detection
- Duplicate entry detection
- Recommended fixes

**How to use**:
1. Go to owner details page
2. Find the truck in the Loaded Trucks table
3. Click the blue AlertCircle icon in the Status column
4. Review detailed audit report

#### 3. **Automatic Fixes**
For unlinked payments, the system can:
- Restore missing truckPayments entries
- Add audit log of the fix
- Recalculate balances

**How to use**:
1. Run audit on a truck
2. If unlinked payments found, click "Fix All" button
3. System will restore the missing entries
4. Re-run audit to confirm fix

## Technical Details

### Data Structure

#### TruckPayments
```typescript
truckPayments/{truckId}/{paymentEntryId} = {
  amount: number,
  timestamp: string,
  paymentId: string,  // Links to payments/{owner}
  note: string
}
```

#### Owner Payments
```typescript
payments/{owner}/{paymentId} = {
  amount: number,
  timestamp: string,
  allocatedTrucks: [
    { truckId: string, amount: number }
  ],
  note: string,
  type: "cash_payment" | "balance_usage"
}
```

### Audit Logic

```typescript
// For each truck:
1. Get all entries from truckPayments/{truckId}
2. Calculate total allocated from those entries
3. Get all payments from payments/{owner}
4. Find payments that allocate to this truck
5. Compare:
   - If payment allocates to truck BUT not in truckPayments → UNLINKED
   - If truck appears multiple times → DUPLICATE
   - If balance mismatch → DISCREPANCY
```

### Fix Process

```typescript
// Fixing unlinked payments:
1. For each unlinked payment:
   - Create new entry in truckPayments/{truckId}
   - Include original payment details
   - Add "restoredAt" timestamp
2. Create audit log in audit_logs/reconciliation_fixes
3. Recalculate truck payment status
```

## Best Practices

### Prevention

1. **Atomic Updates**: Always use Firebase's `update()` with all related paths at once
   ```typescript
   const updates = {};
   updates[`payments/${owner}/${paymentId}`] = paymentData;
   updates[`truckPayments/${truckId}/${truckPaymentId}`] = truckPaymentData;
   await update(ref(database), updates); // All or nothing
   ```

2. **Validation**: Before payment submission, verify:
   - All trucks exist
   - No duplicate truck numbers in selection
   - Total allocation matches payment amount

3. **Regular Audits**: Run owner audit monthly
   ```typescript
   // Schedule this as a cloud function
   const results = await auditOwner(database, ownerName);
   if (results.trucksWithIssues > 0) {
     // Alert admin
   }
   ```

### Recovery

1. **When Owner Reports Discrepancy**:
   ```
   Step 1: Run full owner audit
   Step 2: Review all trucks with issues
   Step 3: For each problematic truck:
           - Run individual truck audit
           - Review unlinked payments
           - Check for duplicates
   Step 4: Fix unlinked payments if found
   Step 5: Manually handle duplicates
   Step 6: Re-run audit to confirm
   ```

2. **Document Everything**:
   - Take screenshots of audit results
   - Note the discrepancy amount
   - Record owner's claimed balance
   - Save fix actions taken

3. **Verify with Owner**:
   - After fixes, export updated statement
   - Send to owner for verification
   - Update their records

## API Reference

### `auditTruck(database, truck, owner)`
Audits a single truck for payment issues.

**Returns**: `TruckReconciliationReport`
```typescript
{
  truckId: string
  truckNumber: string
  totalDue: number
  totalAllocated: number
  currentBalance: number
  expectedBalance: number
  discrepancy: number
  paymentsFound: TruckPayment[]
  unlinkedPayments: any[]
  duplicateEntries: string[]
  issues: string[]
  fixes: string[]
}
```

### `auditOwner(database, owner)`
Audits all trucks for an owner.

**Returns**:
```typescript
{
  totalTrucks: number
  trucksWithIssues: number
  totalDiscrepancy: number
  reports: TruckReconciliationReport[] // Only trucks with issues
}
```

### `fixUnlinkedPayments(database, truckId, unlinkedPayments)`
Restores missing truckPayments entries.

**Parameters**:
```typescript
truckId: string
unlinkedPayments: Array<{
  paymentId: string
  amount: number
  timestamp: string
  note?: string
}>
```

**Side Effects**:
- Creates entries in `truckPayments/{truckId}`
- Creates audit log in `audit_logs/reconciliation_fixes`

## Troubleshooting

### Issue: Audit shows discrepancy but no unlinked payments

**Possible causes**:
1. Payment allocated to wrong truck
2. AT20 or price value changed after payment
3. Manual database edits
4. Tolerance write-off applied ($0.50 threshold)

**Solution**:
1. Check `tolerance_writeoffs/{owner}` for this truck
2. Review payment history for misallocations
3. Verify AT20 and price values in work_details
4. Check audit_logs for manual adjustments

### Issue: Multiple unlinked payments for same truck

**Possible causes**:
1. System crash during payment processing
2. Network interruption
3. Race condition with multiple users

**Solution**:
1. Run "Fix All" to restore all at once
2. Verify total matches expected
3. Check for duplicate payments
4. Review timestamp sequence

### Issue: Duplicate truck entries

**This requires manual intervention**:
1. Identify which entry is correct (check timestamps, loaded status)
2. Consolidate payments to correct entry
3. Delete or archive incorrect entry
4. Document the merge in audit_logs

## Future Improvements

1. **Automated Daily Audits**
   - Cloud function runs nightly
   - Emails report to admin
   - Auto-fix simple issues

2. **Payment Verification**
   - Pre-submission audit
   - Warn if allocation creates discrepancy
   - Prevent problematic payments

3. **Reconciliation Dashboard**
   - Overview of all owners
   - Highlight high-risk accounts
   - Track fix history

4. **AI-Powered Detection**
   - Pattern recognition for common issues
   - Predictive alerts before problems occur
   - Suggested fixes with confidence scores

## Support

If you encounter an issue not covered here:
1. Run both owner and truck audits
2. Take screenshots of results
3. Document the expected vs actual balance
4. Check audit_logs and tolerance_writeoffs
5. Contact development team with findings

---

**Last Updated**: January 2025  
**Version**: 1.0  
**Author**: GitHub Copilot
