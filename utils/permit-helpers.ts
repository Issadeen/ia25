import { Database, ref, get, query, orderByChild, equalTo } from 'firebase/database';
import type { PermitEntry } from '@/types/permits';

export const findAvailablePermitEntry = async (
  db: Database,
  product: string,
  quantity: number
): Promise<PermitEntry | null> => {
  const tr800Ref = ref(db, 'tr800');
  const snapshot = await get(tr800Ref);
  
  if (!snapshot.exists()) return null;

  let bestMatch: PermitEntry | null = null;
  
  snapshot.forEach((child) => {
    const entry = child.val();
    if (
      entry.product.toLowerCase() === product.toLowerCase() &&
      entry.destination.toLowerCase() === 'ssd' &&
      entry.remainingQuantity >= quantity &&
      !entry.allocated
    ) {
      if (!bestMatch || entry.timestamp < bestMatch.timestamp) {
        bestMatch = { ...entry, id: child.key };
      }
    }
  });

  return bestMatch;
};

export const checkExistingPermitAllocation = async (
  db: Database,
  truckNumber: string
): Promise<boolean> => {
  const allocationsRef = ref(db, 'tr800_allocations');
  const allocationsQuery = query(
    allocationsRef,
    orderByChild('truck'),
    equalTo(truckNumber)
  );
  
  const snapshot = await get(allocationsQuery);
  return snapshot.exists();
};
