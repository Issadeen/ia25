import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface WorkIdDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (workId: string) => Promise<boolean>;
}

export function WorkIdDialog({ isOpen, onClose, onVerify }: WorkIdDialogProps) {
  const [workId, setWorkId] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    if (!workId.trim()) {
      setError("Please enter your Work ID");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const isValid = await onVerify(workId);
      if (!isValid) {
        setError("Invalid Work ID");
      }
    } catch (err) {
      setError("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Work ID</DialogTitle>
          <DialogDescription>
            Please enter your work ID to continue with the edit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Input
            placeholder="Enter your Work ID"
            value={workId}
            onChange={(e) => setWorkId(e.target.value.toUpperCase())}
            disabled={isVerifying}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={isVerifying}>
              Cancel
            </Button>
            <Button onClick={handleVerify} disabled={isVerifying}>
              {isVerifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Verify"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
