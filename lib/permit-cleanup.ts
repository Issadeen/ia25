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
    const [preAllocationsSnapshot, workDetailsSnapshot] = await Promise.all([
      get(ref(db, 'permitPreAllocations')),
      get(ref(db, 'work_details'))
    ]);

    if (!preAllocationsSnapshot.exists()) return result;

    const updates: Record<string, any> = {};
    const processed = new Set<string>();

    for (const [key, allocation] of Object.entries(preAllocationsSnapshot.val())) {
      const { truckNumber, quantity } = allocation as PreAllocation;
      
      // Handle zero or invalid quantities
      if (!quantity || quantity <= 0) {
        if (process.env.NODE_ENV === 'development') {
          console.info(`[Cleanup] Removing invalid allocation for ${truckNumber}`);
        }
        const workDetailQuery = query(
          ref(db, 'work_details'), 
          orderByChild('truck_number'), 
          equalTo(truckNumber)
        );
        
        const workDetailSnapshot = await get(workDetailQuery);
        if (workDetailSnapshot.exists()) {
          const [workId] = Object.keys(workDetailSnapshot.val());
          // Reset work detail status
          updates[`work_details/${workId}/permitAllocated`] = false;
          updates[`work_details/${workId}/permitNumber`] = null;
          updates[`work_details/${workId}/permitEntryId`] = null;
        }
        
        // Remove the invalid allocation
        updates[`permitPreAllocations/${key}`] = null;
        result.duplicatesRemoved++;
        continue;
      }

      // Handle duplicates
      if (processed.has(truckNumber)) {
        updates[`permitPreAllocations/${key}`] = null;
        result.duplicatesRemoved++;
      } else {
        processed.add(truckNumber);
        result.consolidated++;
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }

  } catch (error) {
    console.error('[Cleanup Error]:', error instanceof Error ? error.message : 'Unknown error');
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

export const cleanupZeroQuantityAllocations = async (db: Database) => {
  try {
    const allocRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(allocRef);
    
    if (!snapshot.exists()) {
      return 0;
    }
    
    const updates: { [key: string]: null } = {};
    let cleanupCount = 0;
    
    snapshot.forEach((child) => {
      const allocation = child.val();
      if (!allocation.quantity || allocation.quantity <= 0) {
        updates[`permitPreAllocations/${child.key}`] = null;
        cleanupCount++;
      }
    });
    
    if (cleanupCount > 0) {
      await update(ref(db), updates);
      console.log(`[Permit Cleanup] Removed ${cleanupCount} zero-quantity allocations`);
    }
    
    return cleanupCount;
  } catch (error) {
    console.error('[Permit Cleanup] Error cleaning up zero-quantity allocations:', error);
    throw error;
  }
};
