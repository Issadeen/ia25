import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface PermitEntryHelperProps {
  product: string;
  destination: string;
}

export function PermitEntryHelper({ product, destination }: PermitEntryHelperProps) {
  const router = useRouter();
  
  return (
    <div className="mt-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
      <p className="text-sm text-amber-800 dark:text-amber-300 mb-2">
        No permit entries are available for {product.toUpperCase()} to {destination.toUpperCase()}.
      </p>
      <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
        You need to create permit entries before you can allocate.
      </p>
      <Button 
        variant="outline" 
        size="sm"
        className="mt-1 border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900"
        onClick={() => router.push('/dashboard/work/permits')}
      >
        Go to Permit Management
      </Button>
    </div>
  );
}
