import { Database, ref, get, update } from 'firebase/database';

/**
 * Utility to ensure entries are properly synchronized across destinations
 * Maintains backward compatibility with existing SSD entries
 */
export const syncAllocationsToEntriesDb = async (db: Database) => {
  try {
    // Get all tr800 entries
    const tr800Ref = ref(db, 'tr800');
    const tr800Snapshot = await get(tr800Ref);
    
    if (!tr800Snapshot.exists()) {
      console.warn('No TR800 entries found');
      return { success: false, message: 'No TR800 entries found' };
    }
    
    // Get existing allocations
    const allocationsRef = ref(db, 'allocations');
    const allocationsSnapshot = await get(allocationsRef);
    const existingAllocations = allocationsSnapshot.exists() ? allocationsSnapshot.val() : {};
    
    // Prepare updates to ensure allocations contains all entries from tr800
    const updates: { [key: string]: any } = {};
    let addedCount = 0;
    let updatedCount = 0;
    let removedCount = 0;
    
    // Process tr800 entries for all destinations
    tr800Snapshot.forEach((childSnapshot) => {
      const tr800Entry = childSnapshot.val();
      const key = childSnapshot.key!;
      const destination = tr800Entry.destination?.toLowerCase() || 'ssd'; // Default to SSD for backwards compatibility
      
      if (!existingAllocations[key]) {
        // Entry doesn't exist in allocations, add it with destination info
        updates[`allocations/${key}`] = {
          ...tr800Entry,
          destination: destination, // Ensure destination is explicitly set
          lastUpdated: new Date().toISOString()
        };
        addedCount++;
      } else if (existingAllocations[key].remainingQuantity !== tr800Entry.remainingQuantity) {
        // Entry exists but quantities don't match, update it
        updates[`allocations/${key}/remainingQuantity`] = tr800Entry.remainingQuantity;
        updates[`allocations/${key}/lastUpdated`] = new Date().toISOString();
        
        // Make sure destination is set correctly
        if (!existingAllocations[key].destination) {
          updates[`allocations/${key}/destination`] = destination;
        }
        updatedCount++;
      }
    });
    
    // Remove any allocations that don't exist in tr800
    Object.keys(existingAllocations).forEach((key) => {
      if (!tr800Snapshot.child(key).exists()) {
        updates[`allocations/${key}`] = null;
        removedCount++;
      }
    });
    
    // Apply updates if needed
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      return { 
        success: true, 
        message: `Sync completed: Added ${addedCount}, Updated ${updatedCount}, Removed ${removedCount} entries`
      };
    }
    
    return { success: true, message: 'All entries already in sync' };
  } catch (error) {
    console.error('Error syncing allocations:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error during sync'
    };
  }
};

/**
 * Ensure a specific entry exists in the allocations database with correct values
 */
export const ensureEntryInAllocations = async (db: Database, entryId: string) => {
  try {
    // First check if entry exists in tr800
    const tr800EntryRef = ref(db, `tr800/${entryId}`);
    const tr800Snapshot = await get(tr800EntryRef);
    
    if (!tr800Snapshot.exists()) {
      return { success: false, message: 'Entry not found in TR800 database' };
    }
    
    // Get the entry data including destination
    const tr800Data = tr800Snapshot.val();
    const destination = tr800Data.destination?.toLowerCase() || 'ssd'; // Default to SSD if not specified
    
    // Check if entry exists in allocations
    const allocationRef = ref(db, `allocations/${entryId}`);
    const allocationSnapshot = await get(allocationRef);
    
    if (allocationSnapshot.exists()) {
      // Entry exists, check if data is current
      const allocationData = allocationSnapshot.val();
      
      const needsUpdate = 
        allocationData.remainingQuantity !== tr800Data.remainingQuantity ||
        !allocationData.destination || 
        allocationData.destination.toLowerCase() !== destination;
      
      if (needsUpdate) {
        // Update the allocation entry
        await update(ref(db), {
          [`allocations/${entryId}/remainingQuantity`]: tr800Data.remainingQuantity,
          [`allocations/${entryId}/destination`]: destination,
          [`allocations/${entryId}/lastUpdated`]: new Date().toISOString()
        });
        return { success: true, message: 'Entry updated in allocations' };
      }
      
      return { success: true, message: 'Entry already exists and is up to date' };
    } else {
      // Entry doesn't exist, create it
      await update(ref(db), {
        [`allocations/${entryId}`]: {
          ...tr800Data,
          destination: destination, // Ensure destination is explicitly set
          lastUpdated: new Date().toISOString()
        }
      });
      return { success: true, message: 'Entry added to allocations' };
    }
  } catch (error) {
    console.error('Error ensuring entry in allocations:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};
