import { Database, ref, get, update } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';

// Interface for the result of findAvailablePermitEntries (now just the entry itself)
export type FoundPermitEntry = PermitEntry;

export const findAvailablePermitEntries = async (
  db: Database, 
  product: string, 
  quantity: number, // Keep quantity for potential future optimizations, but don't use for filtering here
  destination: string
): Promise<FoundPermitEntry[]> => {
  const entriesRef = ref(db, 'allocations');
  const snapshot = await get(entriesRef);
  
  if (!snapshot.exists()) return [];

  const availableEntries: PermitEntry[] = [];
  
  snapshot.forEach((child) => {
    const entry = child.val() as PermitEntry;
    const entryId = child.key;

    if (!entryId) return; // Skip if key is somehow null

    // Strict filtering based on product, destination, and positive remaining quantity
    if (
      entry.product?.toLowerCase() === product.toLowerCase() &&
      entry.destination?.toLowerCase() === destination.toLowerCase() && // Match exact destination
      entry.remainingQuantity > 0 &&
      !entry.used // Assuming 'used' flag on entry means fully depleted or manually marked
    ) {
      availableEntries.push({
        ...entry,
        id: entryId, // Ensure ID is included
      });
    }
  });

  // Sort by timestamp (oldest first) - FIFO
  availableEntries.sort((a, b) => a.timestamp - b.timestamp);

  // Return all matching entries; the allocation logic will determine how much to take from each
  return availableEntries;
};

export const findAvailablePermitEntry = async (
  db: Database,
  product: string,
  quantity: number, // Quantity check will happen via checkEntryVolumes before allocation
  destination: string // Add destination parameter
): Promise<PermitEntry | null> => {
  const entriesRef = ref(db, 'allocations');
  const snapshot = await get(entriesRef);
  
  if (!snapshot.exists()) return null;

  const candidates: PermitEntry[] = [];
  snapshot.forEach((child) => {
    const entry = child.val() as PermitEntry;
    const entryId = child.key;
    if (!entryId) return;

    // Strict filtering
    if (
      entry.product?.toLowerCase() === product.toLowerCase() &&
      entry.destination?.toLowerCase() === destination.toLowerCase() && // Match destination
      entry.remainingQuantity > 0 && // Check base remaining quantity
      !entry.used
    ) {
      candidates.push({ ...entry, id: entryId });
    }
  });

  // Sort candidates by FIFO
  candidates.sort((a, b) => a.timestamp - b.timestamp);

  // The caller should use checkEntryVolumes on the returned candidate before allocating
  // This function just finds the *first* potential match based on FIFO.
  return candidates.length > 0 ? candidates[0] : null; 
};

export interface VolumeCheck {
  entryId: string;
  initialVolume: number; // Added for clarity
  currentVolume: number; // Renamed from available
  preAllocatedVolume: number; // Renamed from preAllocated
  remainingVolume: number; // Renamed from remaining
  isValid: boolean; // Indicates if currentVolume >= preAllocatedVolume
}

export const checkEntryVolumes = async (
  db: Database,
  entryId: string
): Promise<VolumeCheck> => {
  try {
    // Get entry data and all pre-allocations in parallel
    const [entrySnapshot, preAllocationsSnapshot] = await Promise.all([
      get(ref(db, `allocations/${entryId}`)),
      get(ref(db, 'permitPreAllocations')) // Fetch all pre-allocations
    ]);

    if (!entrySnapshot.exists()) {
      throw new Error(`Permit entry ${entryId} not found in allocations`);
    }

    const entry = entrySnapshot.val() as PermitEntry;
    
    // Calculate actual pre-allocated volume by summing quantities from active pre-allocations for this entry
    const activePreAllocations = preAllocationsSnapshot.exists() 
      ? Object.values(preAllocationsSnapshot.val() as Record<string, PreAllocation>)
          .filter(pa => pa.permitEntryId === entryId && !pa.used) // Filter by entryId and not used
      : [];
      
    const preAllocatedVolume = activePreAllocations.reduce((sum, pa) => sum + (pa.quantity || 0), 0);

    // Calculate remaining volume based on current entry quantity and summed pre-allocations
    const currentVolume = entry.remainingQuantity || 0;
    const initialVolume = entry.initialQuantity || 0;
    const remainingVolume = currentVolume - preAllocatedVolume; // This is the actual available volume

    console.info('Volume check details:', {
      entryId,
      initialVolume,
      currentVolume, // The value stored in allocations/{id}/remainingQuantity
      preAllocatedVolume, // Sum of active pre-allocations for this entry
      remainingVolume, // currentVolume - preAllocatedVolume
      isValid: remainingVolume >= 0 // Check if calculations are sound
    });

    return {
      entryId,
      initialVolume,
      currentVolume,
      preAllocatedVolume,
      remainingVolume, // This is the key value representing what's actually available
      isValid: remainingVolume >= 0 // Basic sanity check
    };
  } catch (error) {
    console.error(`Error checking volumes for entry ${entryId}:`, error);
    // Return a default error state or re-throw
    return {
      entryId,
      initialVolume: 0,
      currentVolume: 0,
      preAllocatedVolume: 0,
      remainingVolume: -1, // Indicate error or unavailability
      isValid: false
    };
  }
};

export const updateEntryVolume = async (
  db: Database,
  permitEntryId: string,
  newVolume: number
): Promise<void> => {
  try {
    const entryRef = ref(db, `allocations/${permitEntryId}`);
    
    // Optional: Add a check here against current pre-allocations if needed,
    // though the allocation logic itself should prevent overdrawing.
    // const volumeCheck = await checkEntryVolumes(db, permitEntryId);
    // if (newVolume < volumeCheck.preAllocatedVolume) {
    //   throw new Error(`New volume (${newVolume}) cannot be less than currently pre-allocated volume (${volumeCheck.preAllocatedVolume})`);
    // }

    await update(entryRef, {
      remainingQuantity: newVolume,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Volume update error:', error);
    throw error;
  }
};
