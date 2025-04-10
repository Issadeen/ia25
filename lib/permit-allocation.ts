import { Database, ref, set, get, update, DatabaseReference, query, orderByChild, equalTo } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';
import { getPermitEntryStatus, validatePermitEntry } from '@/utils/permit-helpers';

export const preAllocatePermitEntry = async (
  db: Database,
  truckNumber: string,
  product: string,
  owner: string,
  permitEntryId: string,
  permitNumber: string,
  destination: string,
  quantity?: number // Add optional quantity parameter
) => {
  try {
    // First check if pre-allocation already exists
    const existingAllocRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(existingAllocRef);
    
    if (snapshot.exists()) {
      const existingAllocation = (Object.values(snapshot.val()) as PreAllocation[]).find(
        (alloc) => 
          alloc.truckNumber === truckNumber && 
          !alloc.used &&
          alloc.destination?.toLowerCase() === destination.toLowerCase()
      );
      
      if (existingAllocation) {
        // If existing allocation has zero quantity, clean it up
        if (existingAllocation.quantity === 0) {
          await update(ref(db), {
            [`permitPreAllocations/${existingAllocation.id}`]: null
          });
        } else {
          throw new Error(`Truck ${truckNumber} already has a permit allocated for ${destination}`);
        }
      }
    }

    // Validate quantity
    const actualQuantity = quantity || 0;
    if (actualQuantity <= 0) {
      throw new Error("Cannot allocate permit with zero or negative quantity");
    }

    // Create new pre-allocation with required fields
    const allocData = {
      truckNumber,
      product,
      owner,
      permitEntryId,
      permitNumber,
      destination: destination.toLowerCase(),
      quantity: actualQuantity,
      allocatedAt: new Date().toISOString(),
      used: false
    };

    // Generate allocation ID
    const allocationId = generateAllocationId();

    // Use set for new allocation
    const newAllocRef = ref(db, `permitPreAllocations/${allocationId}`);
    await set(newAllocRef, allocData);

    return { success: true, data: { ...allocData, id: allocationId } };

  } catch (error) {
    console.error('[Permit Allocation Error]:', {
      truck: truckNumber,
      permit: permitNumber,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

// Add this helper function to generate allocation IDs
const generateAllocationId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
};

export const markPermitAsUsed = async (db: Database, allocationId: string) => {
  const updates: { [key: string]: any } = {};
  updates[`permitPreAllocations/${allocationId}/used`] = true;
  updates[`permitPreAllocations/${allocationId}/usedAt`] = new Date().toISOString();
  
  await update(ref(db), updates);
};

// Add this function to validate allocation data
const validateAllocationData = (data: any): boolean => {
  return (
    data.truckNumber && 
    data.permitNumber && 
    typeof data.quantity === 'number' &&
    data.destination
  );
};

export const resetTruckAllocation = async (
  db: Database,
  truckNumber: string,
  destination?: string // Optional - if provided, only reset allocations for this destination
): Promise<void> => {
  try {
    // Get current allocation
    const preAllocationsSnapshot = await get(
      query(ref(db, 'permitPreAllocations'), 
        orderByChild('truckNumber'), 
        equalTo(truckNumber)
      )
    );

    if (preAllocationsSnapshot.exists()) {
      const updates: Record<string, any> = {};
      
      // Remove allocations for this truck
      preAllocationsSnapshot.forEach((snapshot) => {
        const allocation = snapshot.val();
        // If destination is specified, only remove matching allocations
        if (!destination || allocation.destination === destination) {
          updates[`permitPreAllocations/${snapshot.key}`] = null;
        }
      });

      // Reset work detail permit status
      const workSnapshot = await get(
        query(ref(db, 'work_details'), 
          orderByChild('truck_number'), 
          equalTo(truckNumber)
        )
      );

      if (workSnapshot.exists()) {
        // Loop through all work details for this truck
        workSnapshot.forEach((childSnapshot) => {
          const workDetail = childSnapshot.val();
          
          // If we're removing all allocations or there's only one destination
          if (!destination || !preAllocationsSnapshot.exists() || preAllocationsSnapshot.size === 1) {
            updates[`work_details/${childSnapshot.key}/permitAllocated`] = false;
            updates[`work_details/${childSnapshot.key}/permitNumber`] = null;
            updates[`work_details/${childSnapshot.key}/permitEntryId`] = null;
            updates[`work_details/${childSnapshot.key}/permitDestination`] = null;
          }
          // Otherwise just remove this specific destination if it matches
          else if (destination && workDetail.permitDestination === destination) {
            updates[`work_details/${childSnapshot.key}/permitAllocated`] = false;
            updates[`work_details/${childSnapshot.key}/permitNumber`] = null;
            updates[`work_details/${childSnapshot.key}/permitEntryId`] = null;
            updates[`work_details/${childSnapshot.key}/permitDestination`] = null;
          }
        });
      }

      await update(ref(db), updates);
    }
  } catch (error) {
    console.error('Error resetting truck allocation:', error);
    throw error;
  }
};

export const releasePreAllocation = async (
  db: Database,
  preAllocationId: string
): Promise<void> => {
  try {
    const preAllocationRef = ref(db, `permitPreAllocations/${preAllocationId}`);
    const snapshot = await get(preAllocationRef);
    
    if (!snapshot.exists()) {
      throw new Error('Pre-allocation not found');
    }
    
    const preAllocation = snapshot.val();
    const updates: { [key: string]: any } = {};
    
    // Reduce pre-allocated quantity in entries node
    const currentQuantitySnapshot = await get(ref(db, `entries/${preAllocation.permitEntryId}/preAllocatedQuantity`));
    updates[`entries/${preAllocation.permitEntryId}/preAllocatedQuantity`] = 
      (currentQuantitySnapshot.val() || 0) - preAllocation.quantity;
    
    updates[`entries/${preAllocation.permitEntryId}/lastUpdated`] = new Date().toISOString();
    updates[`permitPreAllocations/${preAllocationId}`] = null;
    
    await update(ref(db), updates);
  } catch (error) {
    console.error('Error releasing pre-allocation:', error);
    throw error;
  }
};

export const cleanupOrphanedAllocations = async (db: Database) => {
  try {
    const [workDetailsSnap, preAllocationsSnap] = await Promise.all([
      get(ref(db, 'work_details')),
      get(ref(db, 'permitPreAllocations'))
    ]);

    if (!preAllocationsSnap.exists()) return;

    const updates: { [key: string]: null } = {};
    const loadedTrucks = new Map<string, { loadedAt: string; destination: string }>();
    
    // Build map of loaded trucks with timestamps
    if (workDetailsSnap.exists()) {
      Object.values(workDetailsSnap.val()).forEach((detail: any) => {
        if (detail.loaded && detail.truck_number) {
          loadedTrucks.set(detail.truck_number, {
            loadedAt: detail.loadedAt || new Date().toISOString(),
            destination: detail.destination?.toLowerCase() || ''
          });
        }
      });
    }

    const now = new Date().getTime();
    const GRACE_PERIOD = 30 * 60 * 1000; // 30 minutes grace period

    preAllocationsSnap.forEach((child) => {
      const allocation = child.val();
      const loadInfo = loadedTrucks.get(allocation.truckNumber);
      
      if (loadInfo) {
        const loadedTime = new Date(loadInfo.loadedAt).getTime();
        const allocationTime = new Date(allocation.allocatedAt).getTime();
        
        // Clean up if:
        // 1. Truck is loaded and allocation matches destination
        // 2. Loading happened after allocation
        // 3. Outside grace period to prevent premature cleanup
        if (
          loadInfo.destination === allocation.destination?.toLowerCase() &&
          loadedTime > allocationTime &&
          (now - loadedTime) > GRACE_PERIOD && 
          !allocation.used
        ) {
          updates[`permitPreAllocations/${child.key}`] = null;
          console.log(`Cleaning up allocation for ${allocation.truckNumber} (loaded: ${loadInfo.loadedAt})`);
        }
      }
      
      // Also clean up very old allocations (48 hours)
      const allocationAge = now - new Date(allocation.allocatedAt).getTime();
      if (allocationAge > 48 * 60 * 60 * 1000 && !allocation.used) {
        updates[`permitPreAllocations/${child.key}`] = null;
        console.log(`Cleaning up old allocation for ${allocation.truckNumber} (age: ${Math.round(allocationAge/3600000)}h)`);
      }
    });

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      return {
        success: true,
        cleaned: Object.keys(updates).length
      };
    }

    return { success: true, cleaned: 0 };

  } catch (error) {
    console.error('Cleanup error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const consolidatePermitAllocations = async (
  db: Database,
  truckNumber: string,
  product: string
): Promise<void> => {
  const preAllocationsRef = ref(db, 'permitPreAllocations');
  const snapshot = await get(preAllocationsRef);
  
  if (!snapshot.exists()) return;
  
  const allocations = Object.entries(snapshot.val())
    .filter(([_, a]: [string, any]) => 
      a.truckNumber === truckNumber && 
      a.product === product && 
      !a.used
    )
    .map(([id, data]) => ({
      ...data as PreAllocation
    }));
  
  if (allocations.length <= 1) return;
  
  // Consolidate into the first allocation
  const primary = allocations[0];
  const updates: { [key: string]: any } = {};
  let totalQuantity = primary.quantity;
  
  // Sum up quantities and mark others for deletion
  allocations.slice(1).forEach(allocation => {
    totalQuantity += allocation.quantity;
    updates[`permitPreAllocations/${allocation.id}`] = null;
  });
  
  // Update the primary allocation with total quantity
  updates[`permitPreAllocations/${primary.id}/quantity`] = totalQuantity;
  
  await update(ref(db), updates);
};

export const updatePermitAllocation = async (
  db: Database,
  allocationId: string,
  newQuantity: number,
  originalQuantity: number
): Promise<void> => {
  try {
    const allocationRef = ref(db, `permitPreAllocations/${allocationId}`);
    const snapshot = await get(allocationRef);
    
    if (!snapshot.exists()) {
      throw new Error('Allocation not found');
    }

    const allocation = snapshot.val() as PreAllocation;
    const difference = originalQuantity - newQuantity;

    // Get permit entry
    const entryRef = ref(db, `allocations/${allocation.permitEntryId}`);
    const entrySnapshot = await get(entryRef);
    
    if (!entrySnapshot.exists()) {
      throw new Error('Permit entry not found');
    }

    const entry = entrySnapshot.val();
    const updates: Record<string, any> = {};

    // Update allocation quantity
    updates[`permitPreAllocations/${allocationId}/quantity`] = newQuantity;
    
    // Update permit entry remaining quantity
    updates[`allocations/${allocation.permitEntryId}/remainingQuantity`] = 
      entry.remainingQuantity + difference;
    
    await update(ref(db), updates);
  } catch (error) {
    console.error('Error updating allocation:', error);
    throw error;
  }
};

export const checkTruckPermitAllocation = async (
  db: Database, 
  truckNumber: string,
  destination: string,
  product: string
) => {
  try {
    const permitRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(permitRef);
    
    if (!snapshot.exists()) return null;
    
    let allocation = null;
    snapshot.forEach((child) => {
      const permit = child.val();
      if (permit.truckNumber === truckNumber && 
          !permit.used &&
          permit.destination?.toLowerCase() === destination.toLowerCase() &&
          permit.product.toLowerCase() === product.toLowerCase()) {
        allocation = {
          ...permit,
          id: child.key
        };
      }
    });
    
    return allocation;
  } catch (error) {
    console.error('Error checking permit allocation:', error);
    return null;
  }
};

// Add cleanup function for zero-quantity allocations
export const cleanupZeroQuantityAllocations = async (db: Database) => {
  try {
    const allocRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(allocRef);
    
    if (!snapshot.exists()) return;
    
    const updates: { [key: string]: null } = {};
    let cleanupCount = 0;
    
    snapshot.forEach((child) => {
      const allocation = child.val();
      if (allocation.quantity === 0 || !allocation.quantity) {
        updates[`permitPreAllocations/${child.key}`] = null;
        cleanupCount++;
      }
    });
    
    if (cleanupCount > 0) {
      await update(ref(db), updates);
      console.log(`Cleaned up ${cleanupCount} zero-quantity allocations`);
    }
    
    return cleanupCount;
  } catch (error) {
    console.error('Error cleaning up zero-quantity allocations:', error);
    throw error;
  }
};
