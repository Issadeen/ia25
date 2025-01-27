import { Database, ref, get, update, query, orderByChild, equalTo } from 'firebase/database';
import type { PreAllocation, PermitEntry } from '@/types/permits';

interface CleanupResult {
  duplicatesRemoved: number;
  consolidated: number;
  errors: string[];
}

export const cleanupDuplicateAllocations = async (
  db: Database
): Promise<CleanupResult> => {
  const result: CleanupResult = {
    duplicatesRemoved: 0,
    consolidated: 0,
    errors: []
  };

  try {
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.info('Starting permit system cleanup...');
    }

    // Get all required data
    const [preAllocationsSnapshot, workDetailsSnapshot, allocationsSnapshot] = await Promise.all([
      get(ref(db, 'permitPreAllocations')),
      get(ref(db, 'work_details')),
      get(ref(db, 'allocations'))
    ]);

    if (!preAllocationsSnapshot.exists()) {
      return result;
    }

    let updates: Record<string, any> = {};
    const processedTrucks = new Set<string>();
    let updateCount = 0;

    // Get pre-allocations
    const preAllocations = Object.entries(preAllocationsSnapshot.val() as Record<string, PreAllocation>)
      .map(([id, data]) => ({
        ...data,
        id
      }));

    // Get work details that need permits
    const pendingTrucks = workDetailsSnapshot.exists() 
      ? Object.values(workDetailsSnapshot.val())
          .filter((detail: any) => 
            detail.destination?.toLowerCase() === 'ssd' && 
            !detail.loaded && 
            detail.status === 'queued'
          )
      : [];

    console.log(`Found ${pendingTrucks.length} pending trucks`);

    // Process each pre-allocation
    for (const allocation of preAllocations) {
      // Skip if we've already processed this truck
      if (processedTrucks.has(allocation.truckNumber)) {
        continue;
      }

      // Check if truck is still pending
      const isPending = pendingTrucks.some(
        (t: any) => t.truck_number === allocation.truckNumber
      );

      if (!isPending) {
        // Find the permit entry
        const entry = allocationsSnapshot.exists() 
          ? Object.values(allocationsSnapshot.val() as Record<string, PermitEntry>).find(
              (e) => e.number === allocation.permitNumber
            )
          : null;

        if (entry) {
          // Update permit entry
          const currentPreAllocated = entry.preAllocatedQuantity || 0;
          if (currentPreAllocated > 0) {
            updates[`allocations/${entry.id}/preAllocatedQuantity`] = Math.max(0, currentPreAllocated - (allocation.quantity || 0));
            updates[`allocations/${entry.id}/lastUpdated`] = new Date().toISOString();
          }
        }

        // Remove the pre-allocation
        updates[`permitPreAllocations/${allocation.id}`] = null;
        result.duplicatesRemoved++;
      }

      processedTrucks.add(allocation.truckNumber);
      updateCount++;

      // Apply updates in batches of 100 to avoid large transactions
      if (updateCount >= 100) {
        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
        }
        updates = {};
        updateCount = 0;
      }
    }

    // Apply any remaining updates
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }

    result.consolidated = processedTrucks.size;

    // Log summary instead of individual operations
    if (result.duplicatesRemoved > 0 || result.consolidated > 0) {
      console.info('Cleanup completed:', {
        duplicatesRemoved: result.duplicatesRemoved,
        consolidated: result.consolidated
      });
    }

  } catch (error) {
    console.error('Cleanup failed:', error instanceof Error ? error.message : 'Unknown error');
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
};

export const validateAllocations = async (db: Database): Promise<string[]> => {
  const errors: string[] = [];
  
  try {
    // Get all allocations and entries in one batch
    const [allocationsSnapshot, entriesSnapshot] = await Promise.all([
      get(ref(db, 'permitPreAllocations')),
      get(ref(db, 'allocations'))
    ]);

    if (!allocationsSnapshot.exists()) return errors;

    const allocations = Object.values(allocationsSnapshot.val() as Record<string, PreAllocation>);
    const entries = entriesSnapshot.exists() 
      ? Object.values(entriesSnapshot.val() as Record<string, PermitEntry>)
      : [];

    // Check each allocation
    for (const allocation of allocations) {
      const entry = entries.find(e => e.number === allocation.permitNumber);
      
      if (!entry) {
        errors.push(`Invalid permit number ${allocation.permitNumber} for truck ${allocation.truckNumber}`);
        continue;
      }

      // Check quantities
      if (allocation.quantity > entry.remainingQuantity) {
        errors.push(
          `Over-allocation detected for permit ${allocation.permitNumber}. ` +
          `Allocated: ${allocation.quantity}, Available: ${entry.remainingQuantity}`
        );
      }
    }

  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return errors;
};
