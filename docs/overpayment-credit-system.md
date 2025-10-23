# Overpayment Credit System

## Overview

When a customer overpays on a truck order, the system now:
1. **Marks the truck as "Paid"** with a credit balance (shown in blue as negative)
2. **Automatically transfers the credit** to their Available Balance
3. **Tracks all credits** for future payment use
4. **Maintains audit trail** of all credit transactions

## Features

### 1. Display Changes

#### Individual Truck Status
**Before**: Overpayment showed confusing "$179.39" balance  
**Now**: Shows `-$179.39 (Credit)` in blue, status "Credit"

```
Status Column:
- "Due" = Positive balance (red)
- "Pending" = Partial payment (orange)
- "Paid" = Zero balance (green)
- "Credit" = Overpaid/negative balance (blue)
```

#### Financial Summary
**Total Due**: All truck amounts owed  
**Total Paid**: All payments received  
**Balance**: 
- Positive = Amount still owed (red)
- Zero = Exact payment (green)
- Negative = Credit balance (blue, shows as "Credit")

**Available Balance**: Includes both prepayments AND overpayment credits
- Shows: `$X.XX` (Prepayment) + `$Y.YY` (Credits) = Total Available
- Hint text: "Includes $Y.YY credits"

### 2. Automatic Credit Transfer

**When credit is generated:**

```
Truck: SSD808AC/SSD642AB
Price: $655.00 × 35.891 At20 = $23,508.61
Payment received: $23,688.00
Overpayment: $23,688.00 - $23,508.61 = $179.39

AUTOMATICALLY:
1. Truck marked as "Paid" with -$179.39 balance
2. $179.39 added to owner_credits/{owner}
3. $179.39 added to balance_usage history (type: "deposit")
4. Owner's Available Balance updated
```

### 3. Data Structure

#### Owner Credits Table
```
owner_credits/{owner}/{creditId} = {
  truckId: string,           // Which truck generated credit
  truckNumber: string,       // Truck identifier
  amount: number,            // Credit amount (always positive)
  timestamp: string,         // When credit was created
  source: "overpayment",     // Always "overpayment"
  status: "available",       // Can be: "available", "used", "expired"
  note: string               // Description of credit
}
```

#### Balance Usage History
```
balance_usage/{owner}/{entryId} = {
  amount: number,            // Credit amount
  timestamp: string,         // When credited
  type: "deposit",           // Type of transaction
  usedFor: [],              // Empty until used
  paymentId: string,        // Link to credit record
  note: string              // Description
}
```

### 4. Credit Usage Flow

**When customer uses credit in next payment:**

```
Example:
- Available Balance: $200 (from 2 previous overpayments)
- New truck due: $50
- Payment method: Use available balance

Process:
1. $50 deducted from available credits
2. Credit record status changed to "used"
3. New payment recorded normally
4. Remaining credit: $150
```

## Implementation Details

### Changes to Payment Utils

#### New Function: `getAvailableBalance()`
```typescript
const { prepayment, credits, total } = await getAvailableBalance(database, owner);
// prepayment: $100 (from prepayments)
// credits: $179.39 (from overpayments)
// total: $279.39 (combined available)
```

#### Updated: `updatePaymentStatuses()`
When a payment results in negative balance:
- Marks truck as "Paid"
- Creates credit record in `owner_credits/{owner}`
- Adds deposit entry to `balance_usage/{owner}`
- **Does NOT apply tolerance** to negative balances

#### Updated: `syncTruckPaymentStatus()`
Same credit logic as `updatePaymentStatuses()`

### Changes to Owner Page

1. **New State**: `availableCredits` - tracks total available credits
2. **New Listener**: Subscribes to `owner_credits/{owner}`
3. **Updated Display**: 
   - Shows credit amounts in Financial Summary
   - Displays "-$X.XX" format for negative balances
   - "Includes $X.XX credits" hint

## Usage Examples

### Example 1: Simple Overpayment

**Scenario**: Customer makes full payment + extra

```
Work Details:
- Truck: KCJ601X
- Product: AGO
- At20: 35.923
- Price: $655.00
- Total Due: $23,529.57

Payment: $23,700.00 (overpaid by $170.43)

Result:
✓ Truck status: "Paid" (Credit)
✓ Balance: -$170.43 (shown in blue)
✓ Credit created: owner_credits/{owner}
✓ Available Balance increased by $170.43
```

### Example 2: Using Credits for Next Payment

**Scenario**: Customer has $179.39 credit, needs to pay $50 truck

```
Available Balance: $179.39 (all from credits)
New Truck Due: $50.00
Use Available Balance: Yes

Process:
1. Payment form shows: "Available Balance: $179.39"
2. User selects truck and enters amount
3. System allocates $50 from available balance
4. Credit record: status → "used"
5. Remaining Available: $129.39
```

### Example 3: Mixed Payment (Cash + Credit)

**Scenario**: Customer pays $30 cash + uses $20 credit for $50 truck

```
New Truck Due: $50.00
Available Balance: $179.39
Payment Options:
1. Pay $30 in cash (remaining $20 due)
2. Use $20 from available balance
3. Total covered: $50

Result:
✓ Truck marked as "Paid"
✓ $30 added to payments
✓ $20 deducted from credits
✓ Credit record updated: status → "partially_used"
```

## Audit Trail

All credit transactions are tracked:

```
Example Audit Log:
Timestamp: 2025-01-23 14:30:00
Type: Credit Generated
Truck: SSD808AC/SSD642AB
Amount: $179.39
Reason: Overpayment ($23,688.00 paid, $23,508.61 due)

---

Timestamp: 2025-01-24 09:15:00
Type: Credit Used
Amount: $50.00
For: KCJ601X truck payment
Remaining: $129.39
```

## Important Notes

### ✅ Best Practices

1. **Monitor Credits Regularly**
   - Check "Available Balance" regularly
   - Review `owner_credits` for orphaned/expired credits
   - Clean up old unused credits monthly

2. **Reconciliation**
   - Always verify Available Balance matches sum of prepayment + credits
   - Run audit if discrepancies found
   - Check balance_usage history for tracking

3. **Communication**
   - Inform customer of credit immediately
   - Send statement showing credit balance
   - Explain how credit can be used

### ⚠️ Important Constraints

1. **Credits are NOT automatically expired**
   - Implement cleanup process if desired
   - Mark status as "expired" if old

2. **Credits must be tracked carefully**
   - Cannot delete without audit log
   - Should only mark as "used" when actually applied
   - Keep detailed notes for compliance

3. **Cannot go negative after credit use**
   - If credit insufficient, payment fails
   - User must provide additional cash
   - System prevents overspending

## Troubleshooting

### Issue: Credit not appearing in Available Balance

**Check**:
1. Verify `owner_credits/{owner}` exists and has entries
2. Check status is "available" (not "used" or "expired")
3. Run payment reconciliation audit
4. Check balance_usage history for deposit entry

**Fix**:
```
If missing, manually create:
owner_credits/{owner}/{id} = {
  truckId: "...",
  amount: X.XX,
  timestamp: "...",
  source: "overpayment",
  status: "available"
}
```

### Issue: Available Balance shows wrong amount

**Check**:
1. Sum all "available" credits in owner_credits
2. Add to owner_balances amount
3. Compare to displayed Available Balance

**Fix**:
1. Run audit on all trucks
2. Check for unlinked payments
3. Verify no duplicate credit records
4. Recalculate and update

### Issue: Credit disappeared

**Check**:
1. Search balance_usage for "usage" type transactions
2. Check owner_credits for status != "available"
3. Review audit_logs for manual adjustments
4. Check payment history for allocation

**Actions**:
1. Trace where credit was used
2. Document in audit log
3. Inform customer if unexpected

## Future Enhancements

1. **Credit Expiration**
   - Auto-mark credits as expired after 12 months
   - Send reminder before expiration
   - Clean up monthly

2. **Credit Reports**
   - Dashboard showing all active credits
   - Total credits by owner
   - Credit age analysis

3. **Credit Automation**
   - Auto-apply credits to new orders
   - Preference settings for credit usage
   - Partial auto-payment with credits

4. **Credit Limits**
   - Max credit balance per owner
   - Automatic payout if exceeds limit
   - Configurable thresholds

## Technical Reference

### Database Paths

```
owner_credits/{owner}                    # All credits for owner
owner_credits/{owner}/{id}               # Individual credit

owner_balances/{owner}                   # Prepayment balance
owner_balances/{owner}/{month}           # Monthly balance (legacy)

balance_usage/{owner}                    # Transaction history
balance_usage/{owner}/{id}               # Individual transaction
```

### Functions

**Creating Credit**:
- `updatePaymentStatuses()` - Automatic on overpayment
- `syncTruckPaymentStatus()` - Automatic on status sync

**Reading Credit**:
- `getAvailableBalance(database, owner)` - Get current total

**Modifying Credit** (Manual):
- Update `owner_credits/{owner}/{id}/status`
- Add entry to `balance_usage/{owner}` for audit
- Update `owner_balances/{owner}` if amount changes

---

**Version**: 1.0  
**Last Updated**: January 2025  
**Author**: GitHub Copilot
