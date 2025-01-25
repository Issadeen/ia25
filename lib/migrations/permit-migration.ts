import { getDatabase, ref, get, update } from 'firebase/database';

export const migrateExistingTrucks = async () => {
  const db = getDatabase();
  const updates: { [key: string]: any } = {};
  
  try {
    // Get all work details
    const workDetailsRef = ref(db, 'work_details');
    const snapshot = await get(workDetailsRef);
    
    if (!snapshot.exists()) return;

    const workDetails = Object.entries(snapshot.val())
      .map(([id, data]: [string, any]) => ({
        id,
        ...data
      }))
      .filter(detail => 
        detail.destination?.toLowerCase() === 'ssd' && 
        !detail.loaded && 
        detail.status === 'queued'
      );

    // Get available permit entries
    const tr800Ref = ref(db, 'tr800');
    const tr800Snapshot = await get(tr800Ref);
    
    if (!tr800Snapshot.exists()) return;

    const permitEntries = Object.entries(tr800Snapshot.val())
      .map(([id, data]: [string, any]) => ({
        id,
        ...data
      }))
      .filter(entry => 
        entry.destination?.toLowerCase() === 'ssd' && 
        entry.remainingQuantity > 0
      )
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by oldest first

    // Allocate permits to unloaded SSD trucks
    for (const detail of workDetails) {
      const matchingEntry = permitEntries.find(entry => 
        entry.product.toLowerCase() === detail.product.toLowerCase() &&
        entry.remainingQuantity >= parseFloat(detail.quantity || '0') &&
        !entry.allocated
      );

      if (matchingEntry) {
        // Create permit allocation record
        updates[`permit_allocations/${detail.id}`] = {
          truckNumber: detail.truck_number,
          product: detail.product,
          owner: detail.owner,
          permitEntryId: matchingEntry.id,
          permitNumber: matchingEntry.number,
          quantity: detail.quantity,
          allocatedAt: new Date().toISOString(),
          createdAt: detail.createdAt || new Date().toISOString()
        };

        // Mark entry as allocated
        updates[`tr800/${matchingEntry.id}/allocated`] = true;
        updates[`tr800/${matchingEntry.id}/allocatedTo`] = {
          truck: detail.truck_number,
          product: detail.product,
          owner: detail.owner,
          timestamp: new Date().toISOString()
        };
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      return {
        success: true,
        migratedCount: Object.keys(updates).length / 2 // Divide by 2 because we have 2 updates per truck
      };
    }

    return { success: true, migratedCount: 0 };
  } catch (error) {
    console.error('Migration error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};
