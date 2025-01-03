import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { database } from "@/lib/firebase";
import { ref, set, push, get, update } from "firebase/database";

interface OwnerBalanceDialogProps {
  owner: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  onBalanceUpdate: () => void;
}

export function OwnerBalanceDialog({
  owner,
  open,
  onOpenChange,
  currentBalance,
  onBalanceUpdate
}: OwnerBalanceDialogProps) {
  const [amount, setAmount] = React.useState<number>(0);
  const [note, setNote] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const timestamp = new Date().toISOString();

      // Create prepayment reference first
      const prepaymentRef = push(ref(database, `prepayments/${owner}`));
      if (!prepaymentRef.key) throw new Error('Failed to generate key');

      // Create updates object
      const updates: { [key: string]: any } = {};

      // Add prepayment record
      updates[`prepayments/${owner}/${prepaymentRef.key}`] = {
        amount,
        timestamp,
        note,
        type: 'deposit'
      };

      // Update owner balance - get existing balance first
      const balanceRef = ref(database, `owner_balances/${owner}`);
      const balanceSnapshot = await get(balanceRef);
      const existingBalance = balanceSnapshot.exists() ? balanceSnapshot.val().amount : 0;
      const newBalance = existingBalance + amount;

      updates[`owner_balances/${owner}`] = {
        amount: newBalance,
        lastUpdated: timestamp
      };

      // Apply all updates atomically
      await update(ref(database), updates);

      toast({
        title: "Success",
        description: `Added $${amount.toFixed(2)} to ${owner}'s balance`,
      });

      onBalanceUpdate();
      onOpenChange(false);
      setAmount(0);
      setNote('');

    } catch (error) {
      console.error('Failed to add prepayment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add prepayment",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Prepayment for {owner}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="currentBalance">Current Balance</Label>
            <Input
              id="currentBalance"
              value={currentBalance.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD'
              })}
              disabled
            />
          </div>
          <div>
            <Label htmlFor="amount">Prepayment Amount</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              required
            />
          </div>
          <div>
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note for this prepayment"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={amount <= 0}>
              Add Prepayment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
