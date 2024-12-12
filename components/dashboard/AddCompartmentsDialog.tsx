import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Minus } from "lucide-react";

interface AddCompartmentsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (count: number) => void;
}

export function AddCompartmentsDialog({
  isOpen,
  onClose,
  onAdd,
}: AddCompartmentsDialogProps) {
  const [count, setCount] = useState(1);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add More Compartments</DialogTitle>
          <DialogDescription>
            How many additional compartments do you want to add?
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-4 py-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCount(Math.max(1, count - 1))}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="text-2xl font-semibold w-12 text-center">
            {count}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCount(count + 1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onAdd(count);
              onClose();
            }}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Add Compartments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
