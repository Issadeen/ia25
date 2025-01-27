import { Database, ref, get, update } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';

export interface EntryAllocation {
  entry: PermitEntry;
  quantity: number;
}

const calculateAvailableQuantity = (entry: PermitEntry): number => {
  const preAllocated = entry.preAllocatedQuantity || 0;
  return entry.remainingQuantity - preAllocated;
};

export const findAvailablePermitEntries = async (
  db: Database,
  product: string,
  quantity: number
): Promise<EntryAllocation[]> => {
  const entriesRef = ref(db, 'allocations');
  const snapshot = await get(entriesRef);
  
  if (!snapshot.exists()) return [];

  const availableEntries: PermitEntry[] = [];
  
  snapshot.forEach((child) => {
    const entry = child.val();
    const availableQuantity = calculateAvailableQuantity(entry);
    
    if (
      entry.product?.toLowerCase() === product.toLowerCase() &&
      entry.destination?.toLowerCase() === 'ssd' &&
      availableQuantity > 0 && // Any available quantity might be useful
      !entry.used
    ) {
      availableEntries.push({
        ...entry,
        id: child.key!,
        allocatedTo: entry.allocatedTo || [],
        preAllocatedQuantity: entry.preAllocatedQuantity || 0,
        availableQuantity: availableQuantity // Now TypeScript knows this is valid
      });
    }
  });

  // Sort by timestamp (oldest first) and available quantity (most available first)
  availableEntries.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return calculateAvailableQuantity(b) - calculateAvailableQuantity(a);
  });

  let remainingQuantity = quantity;
  const allocations: EntryAllocation[] = [];

  // Try to fill the required quantity using multiple entries if needed
  for (const entry of availableEntries) {
    if (remainingQuantity <= 0) break;

    const availableQuantity = calculateAvailableQuantity(entry);
    const allocationQuantity = Math.min(availableQuantity, remainingQuantity);

    if (allocationQuantity > 0) {
      allocations.push({
        entry,
        quantity: allocationQuantity
      });
      remainingQuantity -= allocationQuantity;
    }
  }

  return allocations;
};

export const findAvailablePermitEntry = async (
  db: Database,
  product: string,
  quantity: number
): Promise<PermitEntry | null> => {
  const entriesRef = ref(db, 'allocations');
  const snapshot = await get(entriesRef);
  
  if (!snapshot.exists()) return null;

  let bestMatch: PermitEntry | null = null;
  
  snapshot.forEach((child) => {
    const entry = child.val();
    const availableQuantity = calculateAvailableQuantity(entry);
    
    console.log('Checking entry:', {
      entry,
      product: entry.product?.toLowerCase(),
      requestedProduct: product.toLowerCase(),
      availableQuantity,
      requestedQuantity: quantity,
      destination: entry.destination?.toLowerCase()
    });

    // Update validation criteria to match allocation node structure
    if (
      entry.product?.toLowerCase() === product.toLowerCase() &&
      entry.destination?.toLowerCase() === 'ssd' &&
      entry.remainingQuantity >= quantity && // Check remaining quantity directly
      !entry.used // Add check for used flag if needed
    ) {
      if (!bestMatch || entry.timestamp < bestMatch.timestamp) {
        bestMatch = {
          ...entry,
          id: child.key!,
          allocatedTo: entry.allocatedTo || [],
          preAllocatedQuantity: entry.preAllocatedQuantity || 0
        };
      }
    }
  });

  return bestMatch;
};

export const validatePermitEntry = async (
  db: Database,
  permitEntry: PermitEntry,
  quantity: number
): Promise<boolean> => {
  const entryRef = ref(db, `allocations/${permitEntry.id}`);
  const snapshot = await get(entryRef);
  
  if (!snapshot.exists()) return false;
  
  const currentEntry = snapshot.val();
  const availableQuantity = currentEntry.remainingQuantity - (currentEntry.preAllocatedQuantity || 0);
  
  return (
    currentEntry.product === permitEntry.product &&
    currentEntry.destination?.toLowerCase() === 'ssd' &&
    availableQuantity >= quantity
  );
};

export const getPermitEntryStatus = async (
  db: Database,
  permitEntryId: string
): Promise<{
  remainingQuantity: number;
  preAllocatedQuantity: number;
  availableQuantity: number;
}> => {
  const entryRef = ref(db, `allocations/${permitEntryId}`);
  const snapshot = await get(entryRef);
  
  if (!snapshot.exists()) {
    throw new Error('Permit entry not found');
  }
  
  const entry = snapshot.val();
  const preAllocatedQuantity = entry.preAllocatedQuantity || 0;
  const remainingQuantity = entry.remainingQuantity;
  const availableQuantity = remainingQuantity - preAllocatedQuantity;
  
  return {
    remainingQuantity,
    preAllocatedQuantity,
    availableQuantity
  };
};

export interface VolumeCheck {
  available: number;
  allocated: number;
  preAllocated: number;
  remaining: number;
  isValid: boolean;
}

export const checkEntryVolumes = async (
  db: Database,
  entryId: string
): Promise<VolumeCheck> => {
  try {
    // Get all data in parallel
    const [entrySnapshot, preAllocationsSnapshot] = await Promise.all([
      get(ref(db, `allocations/${entryId}`)),
      get(ref(db, 'permitPreAllocations'))
    ]);

    if (!entrySnapshot.exists()) {
      throw new Error('Permit entry not found');
    }

    const entry = entrySnapshot.val() as PermitEntry;
    
    // Calculate actual pre-allocated volume from all active pre-allocations
    const preAllocatedVolume = preAllocationsSnapshot.exists() 
      ? Object.values(preAllocationsSnapshot.val() as Record<string, PreAllocation>)
          .filter(pa => pa.permitEntryId === entryId && !pa.used)
          .reduce((sum, pa) => sum + (pa.quantity || 0), 0)
      : 0;

    // Calculate remaining volume
    const availableVolume = entry.remainingQuantity;
    const remainingVolume = availableVolume - preAllocatedVolume;

    console.info('Volume check details:', {
      entryId,
      availableVolume,
      preAllocatedVolume,
      remainingVolume
    });

    return {
      available: availableVolume,
      allocated: entry.preAllocatedQuantity || 0,
      preAllocated: preAllocatedVolume,
      remaining: remainingVolume,
      isValid: remainingVolume >= 0
    };
  } catch (error) {
    console.error('Volume check error:', {
      entryId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

export const getEntryStatus = (volumeCheck: VolumeCheck): 'available' | 'low' | 'exhausted' => {
  if (volumeCheck.remaining <= 0) return 'exhausted';
  if (volumeCheck.remaining < volumeCheck.available * 0.2) return 'low';
  return 'available';
};

export const updateEntryVolume = async (
  db: Database,
  entryId: string, 
  newVolume: number
): Promise<void> => {
  try {
    const entryRef = ref(db, `allocations/${entryId}`);
    const snapshot = await get(entryRef);

    if (!snapshot.exists()) {
      throw new Error('Permit entry not found');
    }

    const entry = snapshot.val() as PermitEntry;
    const preAllocated = entry.preAllocatedQuantity || 0;

    // Validate new volume against pre-allocated amount
    if (newVolume < preAllocated) {
      throw new Error(
        `New volume (${newVolume}) cannot be less than pre-allocated volume (${preAllocated})`
      );
    }

    await update(entryRef, {
      remainingQuantity: newVolume,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Volume update error:', error);
    throw error;
  }
};

export const getAvailableVolume = async (db: Database, permitEntryId: string): Promise<number> => {
  const entryRef = ref(db, `allocations/${permitEntryId}`);
  const snapshot = await get(entryRef);
  
  if (!snapshot.exists()) {
    throw new Error('Permit entry not found');
  }
  
  const entry = snapshot.val();
  const remaining = entry.remainingQuantity || 0;
  const preAllocated = entry.preAllocatedQuantity || 0;
  
  return remaining - preAllocated;
};

export const checkVolumeAvailability = async (
  db: Database, 
  permitEntryId: string,
  requiredQuantity: number
): Promise<boolean> => {
  const availableVolume = await getAvailableVolume(db, permitEntryId);
  return availableVolume >= requiredQuantity;
};
