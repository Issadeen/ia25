import { Database, ref, get, update, query, orderByChild, equalTo, remove } from 'firebase/database';
import type { PreAllocation, PermitEntry } from '@/types/permits';
import type { WorkDetail } from '@/types/work';

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

export const cleanupLoadedTrucks = async (db: Database) => {
  try {
    const [workSnapshot, preAllocationsSnapshot] = await Promise.all([
      get(ref(db, 'work_details')),
      get(ref(db, 'permitPreAllocations'))
    ]);

    if (!preAllocationsSnapshot.exists()) {
      return { duplicatesRemoved: 0, consolidated: 0 };
    }

    const preAllocations = preAllocationsSnapshot.val();
    const workDetails = workSnapshot.exists() ? workSnapshot.val() : {};
    const updates: { [key: string]: any } = {};
    const deletions: string[] = [];
    let duplicatesRemoved = 0;
    let consolidated = 0;

    // First, remove pre-allocations for loaded trucks
    for (const [allocationId, allocation] of Object.entries(preAllocations)) {
      const truckNumber = (allocation as any).truckNumber;
      // Find matching work detail
      const workDetail = Object.values(workDetails).find((work: any) => 
        work.truck_number === truckNumber && work.loaded
      );

      if (workDetail) {
        deletions.push(`permitPreAllocations/${allocationId}`);
        duplicatesRemoved++;
        console.log(`Removing pre-allocation for loaded truck: ${truckNumber}`);
      }
    }

    // Apply all updates and deletions
    if (deletions.length > 0 || Object.keys(updates).length > 0) {
      const finalUpdates = {
        ...updates,
        ...deletions.reduce((acc, path) => ({ ...acc, [path]: null }), {})
      };
      await update(ref(db), finalUpdates);
    }

    return { duplicatesRemoved, consolidated };
  } catch (error) {
    console.error('Cleanup error:', error);
    throw error;
  }
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

export const validateLoadedTrucks = async (db: Database) => {
  const errors: string[] = [];
  
  try {
    const [workSnapshot, preAllocationsSnapshot] = await Promise.all([
      get(ref(db, 'work_details')),
      get(ref(db, 'permitPreAllocations'))
    ]);

    if (!preAllocationsSnapshot.exists()) {
      return errors;
    }

    const preAllocations = preAllocationsSnapshot.val();
    const workDetails = workSnapshot.exists() ? workSnapshot.val() : {};

    for (const [allocationId, allocation] of Object.entries(preAllocations)) {
      const { truckNumber, permitNumber } = allocation as any;
      
      // Find corresponding work detail
      const workDetail = Object.values(workDetails).find((work: any) => 
        work.truck_number === truckNumber
      ) as WorkDetail | undefined;

      if (!workDetail) {
        errors.push(`Pre-allocation ${allocationId} references non-existent truck ${truckNumber}`);
        continue;
      }

      if (workDetail.loaded) {
        errors.push(`Pre-allocation exists for loaded truck ${truckNumber}`);
      }
    }

    return errors;
  } catch (error) {
    console.error('Validation error:', error);
    throw error;
  }
};
