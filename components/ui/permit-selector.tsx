import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { PermitEntry } from "@/types/permits"

interface PermitSelectorProps {
  entries: PermitEntry[];
  selectedValue: string;
  onValueChange: (value: string) => void;
  required?: boolean;
}

export function PermitSelector({ entries, selectedValue, onValueChange, required }: PermitSelectorProps) {
  return (
    <div className="mt-4">
      <Label htmlFor="permitEntry" className="block text-sm font-medium mb-2">
        Select Permit Entry {required && "(Required for SSD)"}
      </Label>
      <Select value={selectedValue} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select permit entry..." />
        </SelectTrigger>
        <SelectContent>
          {entries.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.number} - Remaining: {entry.remainingQuantity.toLocaleString()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {required && !selectedValue && (
        <p className="mt-2 text-sm text-red-500">
          Please select a permit entry for SSD allocation
        </p>
      )}
    </div>
  );
}
