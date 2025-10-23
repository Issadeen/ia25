# Overpayment Credit System - Quick Visual Guide

## What Changed?

### Before ❌
```
Truck: SSD808AC/SSD642AB
Total Due: $23,508.61
Paid: $23,688.00
Balance: $179.39
Status: Paid (confusing - shows paid but has balance)
Available Balance: $0.00 (credit lost!)
```

**Problem**: Overpayment disappeared! Customer doesn't know they have credit.

---

### After ✅
```
Truck: SSD808AC/SSD642AB
Total Due: $23,508.61
Paid: $23,688.00
Balance: -$179.39 (shown in BLUE)
Status: Credit (clear indication)
Available Balance: $179.39 (includes credits!)
```

**Solution**: Credit is tracked and can be used for future payments!

---

## Financial Summary Display

### Example Scenario

**Owner has:**
- 2 prepayments: $100 total
- 3 overpayment credits: $179.39, $50.00, $25.61 = $255.00 total
- Total Available: $355.00

```
┌─────────────────────────────────────────────────┐
│           FINANCIAL SUMMARY                      │
├─────────────────────────────────────────────────┤
│ Total Due          │ $47,038.18                 │
│ Total Paid         │ $23,688.00                 │
│ Balance            │ $23,350.18 (still owing)  │
│ Available Balance  │ $355.00                    │
│                    │ Includes $255.00 credits   │
└─────────────────────────────────────────────────┘
```

---

## Truck Status Colors

```
┌────────────────┬───────────────────┬─────────────────┐
│ Balance        │ Status            │ Color  │ Meaning  │
├────────────────┼───────────────────┼─────────────────┤
│ $23,529.57     │ Due               │ RED    │ Owes     │
│ $5,000.00      │ Pending           │ ORANGE │ Partial  │
│ $0.00          │ Paid              │ GREEN  │ Settled  │
│ -$179.39       │ Credit            │ BLUE   │ Overpaid │
└────────────────┴───────────────────┴─────────────────┘
```

---

## How Credits Work

### Step 1: Overpayment Occurs
```
Truck Order:
  Total Due: $23,508.61
  
Customer Payment:
  Amount Paid: $23,688.00
  
Calculation:
  $23,688.00 - $23,508.61 = $179.39 OVERPAID ✓
```

### Step 2: System Creates Credit
```
Database Updates:
  ✓ Truck marked as "Paid" with -$179.39 balance
  ✓ Credit record created in owner_credits
  ✓ Deposit entry added to balance_usage
  ✓ Available Balance increased by $179.39
```

### Step 3: Customer Can Use Credit
```
Example - Next Truck Order:
  New Truck Due: $50.00
  Available Balance: $179.39
  
Options:
  a) Pay $50 in cash
  b) Use $50 from available balance (credit)
  c) Mix: $20 cash + $30 from credit
```

---

## Balance Components

### Before: Simple Balance
```
Available Balance = Prepayment Only

owner_balances/owner = $100
Total Available = $100
```

### After: Combined Balance  
```
Available Balance = Prepayment + Credits

owner_balances/owner = $100
owner_credits/owner (available) = $255.00
Total Available = $355.00
```

---

## Real-World Example

### Scenario: Two Truck Orders

**Order 1: AGO Delivery**
```
Work Details:
  Truck: KCJ601X-ZF5704
  At20: 35.923
  Price: $655.00
  Total Due: $23,529.57

Payment: $23,688.00
Overpayment: $158.43

Result:
  Status: Credit (shown in blue)
  Available Balance: +$158.43
```

**Order 2: PMS Delivery (Next Day)**
```
Work Details:
  Truck: SSD808AC/SSD642AB
  At20: 35.891
  Price: $655.00
  Total Due: $23,508.61

Available Balance Available: $158.43
Options:
  1. Pay full $23,508.61 in cash
  2. Use $158.43 from available balance
     + Pay $23,350.18 in cash
  3. Pay $23,350.18 in cash + use full credit

Result:
  If Option 2: Customer pays less cash! ✓
```

---

## Dashboard Views

### Owner Page - Financial Summary Card

```
Before:
┌──────────────────────────────────┐
│ Total Due      $47,038.18        │
│ Total Paid     $23,688.00        │
│ Balance        $23,350.18        │
│ Available Bal  $0.00             │
└──────────────────────────────────┘
Problem: No credit shown!

After:
┌──────────────────────────────────┐
│ Total Due      $47,038.18        │
│ Total Paid     $23,688.00        │
│ Balance        -$179.39 (Credit) │ ← BLUE
│ Available Bal  $179.39           │
│                Incl. $179 credits│ ← NEW
└──────────────────────────────────┘
Solution: Credit visible!
```

### Owner Page - Truck List

```
Truck                   Balance    Status
─────────────────────────────────────────
KCJ601X    $23,529.57   Due        RED
SSD808AC   -$179.39     Credit     BLUE  ← New!
KDR425B    $14,512.48   Due        RED
```

---

## Key Differences Summary

| Feature | Before | After |
|---------|--------|-------|
| Overpayment Handling | Lost/Ignored | Tracked as Credit |
| Balance Display | Always positive | Can be negative |
| Status for Overpaid | "Paid" (ambiguous) | "Credit" (clear) |
| Available Balance | Only prepayment | Prepayment + Credits |
| Credit Usage | N/A | Can apply to future |
| Audit Trail | None | Full tracking |
| Customer Communication | Unclear | Transparent |

---

## Impact on Operations

### Benefits ✓
- Customers know exactly how much credit they have
- Credits automatically applied when making payments
- Transparent reconciliation
- Complete audit trail for compliance
- Reduces accounting disputes

### Process Changes
- No more "lost" overpayments
- Available Balance shows true spending power
- Monthly statements clearer
- Customer support easier

### Admin Actions
- View all credits in Available Balance
- Track credit usage in balance_usage
- Monitor for unusual patterns
- Reconcile against owner claims

---

## Frequently Asked Questions

### Q: What happens to old overpayments?
**A**: They're now tracked in `owner_credits`. Run audit to find them.

### Q: Can credits expire?
**A**: Not yet - but can be marked as "expired" if desired.

### Q: What if customer disputes a credit?
**A**: Check `owner_credits` and `balance_usage` for full history.

### Q: How do I see all credits for an owner?
**A**: Check `owner_credits/{owner}` in Firebase + Available Balance display.

### Q: Can I manually create a credit?
**A**: Yes - add to `owner_credits/{owner}` with status "available" + audit entry.

### Q: What's the format for negative balance?
**A**: Shows as `-$X.XX` in blue with "Credit" status.

---

## Testing Checklist

- [ ] Overpay on a truck ($100 truck, pay $150)
- [ ] Verify balance shows negative in blue
- [ ] Verify status shows "Credit"
- [ ] Verify Available Balance increased
- [ ] Verify credit entry in owner_credits
- [ ] Verify deposit in balance_usage
- [ ] Use credit on next payment
- [ ] Verify credit amount decreased
- [ ] Verify payment applied correctly

---

**For detailed documentation**: See `docs/overpayment-credit-system.md`  
**For implementation details**: See `lib/payment-utils.ts`  
**For UI components**: See `app/dashboard/work/[owner]/page.tsx`
