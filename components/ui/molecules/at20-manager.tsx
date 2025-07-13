'use client'

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Edit, AlertTriangle, TrendingUp, TrendingDown, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface At20ManagerProps {
  truck: any;
  onModify: (newAt20: string, reason: string) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

export function At20Manager({ truck, onModify, isOpen, onClose }: At20ManagerProps) {
  const [newAt20, setNewAt20] = useState(truck?.at20 || '');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const calculateImpact = () => {
    if (!newAt20 || !truck) return null;

    const oldValue = parseFloat(truck.at20 || '0');
    const newValue = parseFloat(newAt20);
    const price = parseFloat(truck.price || '0');

    const volumeDiff = (newValue - oldValue) * 1000; // Convert to liters
    const billingDiff = (newValue - oldValue) * price;

    return {
      volumeDiff,
      billingDiff,
      oldBilling: oldValue * price,
      newBilling: newValue * price,
      isIncrease: newValue > oldValue,
      exceedsOrder: newValue > parseFloat(truck.quantity || '0')
    };
  };

  const handleSubmit = async () => {
    if (!newAt20 || !reason.trim()) return;

    setIsSubmitting(true);
    try {
      await onModify(newAt20, reason);
      onClose();
    } catch (error) {
      console.error('Error modifying AT20:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const impact = calculateImpact();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Modify AT20 - {truck?.truck_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Information */}
          <Card className="p-4">
            <h3 className="font-medium mb-3">Current Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Product:</span>
                <div className="font-medium">{truck?.product}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Ordered Quantity:</span>
                <div className="font-medium">{truck?.quantity} m³</div>
              </div>
              <div>
                <span className="text-muted-foreground">Current AT20:</span>
                <div className="font-medium">{truck?.at20 || 'N/A'} m³</div>
              </div>
              <div>
                <span className="text-muted-foreground">Price per m³:</span>
                <div className="font-medium">${truck?.price}</div>
              </div>
            </div>
          </Card>

          {/* Modification Inputs */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">New AT20 Value (m³)</label>
              <Input
                type="number"
                step="0.01"
                value={newAt20}
                onChange={(e) => setNewAt20(e.target.value)}
                placeholder="Enter new AT20 value"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Reason for Modification</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for this modification"
                className="mt-1"
              />
            </div>
          </div>

          {/* Impact Analysis */}
          {impact && (
            <Card className="p-4 border-2">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                {impact.isIncrease ? (
                  <TrendingUp className="h-4 w-4 text-red-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                )}
                Impact Analysis
              </h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Old Billing:</span>
                  <div className="font-medium">${impact.oldBilling.toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">New Billing:</span>
                  <div className="font-medium">${impact.newBilling.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Billing Change:</span>
                  <Badge variant={impact.isIncrease ? "destructive" : "default"}>
                    {impact.isIncrease ? "+" : ""}${impact.billingDiff.toFixed(2)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Volume Change:</span>
                  <Badge variant={impact.isIncrease ? "destructive" : "default"}>
                    {impact.isIncrease ? "+" : ""}{Math.abs(impact.volumeDiff).toLocaleString()}L
                  </Badge>
                </div>
              </div>

              {impact.exceedsOrder && (
                <Alert className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Warning: New AT20 exceeds ordered quantity. This may require additional approval.
                  </AlertDescription>
                </Alert>
              )}
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!newAt20 || !reason.trim() || isSubmitting}
            >
              {isSubmitting ? "Applying..." : "Apply Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
