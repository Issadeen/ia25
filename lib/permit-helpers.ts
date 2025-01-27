import { Database, ref, get, update } from 'firebase/database';
import type { PermitEntry } from '@/types/permits';

// ...existing code...

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
