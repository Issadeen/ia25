# Payment Reconciliation Audit System - Quick Start

## Problem Solved
Owner claimed balance should be **$14,512.48** but system showed **$27,548.25** - a discrepancy of **$13,035.77**.

Investigation revealed the owner was **correct**. This tool helps identify and fix such issues automatically.

## How to Use

### 1. Check Overall Owner Status
Click the **"Audit Payments"** button at the top of the Loaded Trucks table.

**What it shows**:
- Total trucks checked
- How many have issues
- Total amount of discrepancies
- List of problematic trucks

### 2. Check Individual Truck
Click the **blue AlertCircle icon** next to any truck's status.

**What it shows**:
- Truck's financial details
- All payments found
- **Unlinked payments** (payments that should be there but aren't)
- Duplicate truck entries
- Specific issues and recommended fixes

### 3. Fix Issues Automatically
If unlinked payments are found:
1. Review the unlinked payments in the audit dialog
2. Click the **"Fix All"** button
3. System will restore the missing payment entries
4. Balance will be recalculated automatically

## Common Issues Detected

### ✅ Unlinked Payments
**Problem**: Payment was made but not showing on truck  
**Cause**: Database write was interrupted  
**Fix**: Click "Fix All" button

### ✅ Duplicate Trucks
**Problem**: Same truck appears multiple times  
**Cause**: Multiple trips or data entry error  
**Fix**: Manual consolidation required

### ✅ Balance Mismatch
**Problem**: Math doesn't add up  
**Cause**: AT20/price changed after payment  
**Fix**: Verify values and recalculate

## Step-by-Step: Investigating a Discrepancy

**When an owner says "My balance is wrong":**

1. **Go to their owner page** (`/dashboard/work/{owner}`)

2. **Note what system shows**:
   - Total Due: $_____
   - Total Paid: $_____
   - Balance: $_____

3. **Run owner audit**:
   - Click "Audit Payments" button
   - Wait for results
   - Note how many trucks have issues

4. **Check each problematic truck**:
   - Click the blue icon next to trucks flagged with issues
   - Review unlinked payments
   - Check for duplicates

5. **Fix what you can**:
   - For unlinked payments: Click "Fix All"
   - For duplicates: Manual review needed
   - For other issues: Check the recommendations

6. **Verify with owner**:
   - Export updated statement
   - Confirm new balance matches their records

## Real Example

**Truck**: KDR425B-ZH5348 (PMS)
- At20: 39.925
- Price: $690.00
- Total Due: $27,548.25

**System showed**: Balance $27,548.25 (unpaid)  
**Owner claimed**: Balance $14,512.48  
**Difference**: $13,035.77

**Audit found**:
- 3 unlinked payments totaling $13,035.77
- Payments were in `payments/{owner}` but missing from `truckPayments/{truckId}`

**Fix**:
1. Clicked audit icon on truck
2. Reviewed unlinked payments
3. Clicked "Fix All"
4. System restored 3 payment entries
5. New balance: $14,512.48 ✅

## Technical Notes

**Data checked**:
- `work_details/{truckId}` - Truck information
- `payments/{owner}` - All payments made
- `truckPayments/{truckId}` - Payments allocated to truck
- Cross-reference to find mismatches

**Safe to use**: 
- Read-only until you click "Fix All"
- Creates audit logs of all fixes
- Original data preserved in `audit_logs/reconciliation_fixes`

**Performance**:
- Owner audit: ~2-5 seconds (depends on # of trucks)
- Truck audit: < 1 second
- Fixing: < 1 second per truck

## When to Run Audits

### Regular Schedule
- ✅ End of month (before statements)
- ✅ After bulk payment imports
- ✅ When owner reports discrepancy
- ✅ Before major reconciliations

### Immediate Triggers
- ❗ Owner dispute
- ❗ System crash during payment
- ❗ Network interruption
- ❗ Manual database edits

## Support Checklist

Before escalating an issue:
- [ ] Run owner audit
- [ ] Run truck audit on problematic trucks
- [ ] Screenshot audit results
- [ ] Check `tolerance_writeoffs/{owner}` for this truck
- [ ] Check `audit_logs/{owner}` for recent changes
- [ ] Export current statement
- [ ] Document owner's claimed amount

## Files Added

1. **`lib/reconciliation-helpers.ts`** - Audit logic and fix functions
2. **`app/dashboard/work/[owner]/page.tsx`** - UI integration (updated)
3. **`docs/payment-reconciliation-guide.md`** - Full technical documentation
4. **`docs/reconciliation-quick-start.md`** - This file

---

**Need Help?** See the full guide: `docs/payment-reconciliation-guide.md`
