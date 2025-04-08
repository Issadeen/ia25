import { Database, ref, update, push, get, query, orderByChild, equalTo, set } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';
import { getPermitEntryStatus, validatePermitEntry } from '@/utils/permit-helpers';

export const preAllocatePermitEntry = async (
  db: Database,
  truckNumber: string,
  product: string,
  owner: string,
  permitEntryId: string,
  permitNumber: string,
  destination: string = 'ssd' // Default to SSD for backward compatibility
): Promise<PreAllocation> => {
  try {
    // Check if truck already has an allocation for this destination
    const existingAllocationsSnapshot = await get(
      query(ref(db, 'permitPreAllocations'), 
        orderByChild('truckNumber'), 
        equalTo(truckNumber)
      )
    );

    if (existingAllocationsSnapshot.exists()) {
      // Check if any existing allocation matches this destination
      let hasMatchingDestination = false;
      
      existingAllocationsSnapshot.forEach((snapshot) => {
        const allocation = snapshot.val();
        if (allocation.destination === destination.toLowerCase() && !allocation.used) {
          hasMatchingDestination = true;
        }
      });
      
      if (hasMatchingDestination) {
        throw new Error(`Truck already has a permit allocation for ${destination.toUpperCase()}`);
      }
      
      // Allow allocations for different destinations
      // Continue with allocation for new destination
    }

    // Get permit entry data
    const permitSnapshot = await get(ref(db, `allocations/${permitEntryId}`));
    if (!permitSnapshot.exists()) {
      throw new Error('Permit entry not found');
    }

    // Get work detail data
    const workSnapshot = await get(query(ref(db, 'work_details'), orderByChild('truck_number'), equalTo(truckNumber)));
    if (!workSnapshot.exists()) {
      throw new Error('Work detail not found for truck');
    }

    // Get the work detail for this truck
    const workDetail = Object.values(workSnapshot.val())[0] as any;
    
    // Set quantity based on truck's work detail
    const quantityInLiters = parseFloat(workDetail.quantity) * 1000;

    // Create pre-allocation record
    const preAllocationId = `${truckNumber}-${destination}-${Date.now()}`;
    const newPreAllocationRef = ref(db, `permitPreAllocations/${preAllocationId}`);
    
    const preAllocation: PreAllocation = {
      id: preAllocationId,
      truckNumber,
      product,
      owner,
      permitEntryId,
      permitNumber,
      quantity: quantityInLiters,
      allocatedAt: new Date().toISOString(),
      used: false,
      destination: destination.toLowerCase() // Ensure destination is stored in lowercase
    };

    await set(newPreAllocationRef, preAllocation);

    // Update work detail with permit info
    await update(ref(db, `work_details/${workDetail.id}`), {
      permitAllocated: true,
      permitNumber: permitNumber,
      permitEntryId: permitEntryId,
      permitDestination: destination.toLowerCase()
    });

    return preAllocation;
    
  } catch (error) {
    console.error('[Permit Allocation Error]:', {
      truck: truckNumber,
      permit: permitNumber,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
};

// Update the resetTruckAllocation function to handle multiple destinations
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

export const markPermitUsed = async (
  db: Database,
  preAllocation: PreAllocation
): Promise<void> => {
  const updates: { [key: string]: any } = {};
  
  // Mark as used
  updates[`permitPreAllocations/${preAllocation.id}/used`] = true;
  updates[`permitPreAllocations/${preAllocation.id}/usedAt`] = new Date().toISOString();
  
  // Remove from pending allocations
  updates[`permitPreAllocations/${preAllocation.id}`] = null;
  
  await update(ref(db), updates);
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

export const cleanupOrphanedAllocations = async (db: Database): Promise<void> => {
  const preAllocationsRef = ref(db, 'permitPreAllocations');
  const snapshot = await get(preAllocationsRef);
  
  if (!snapshot.exists()) return;
  
  const updates: { [key: string]: null } = {};
  const seen = new Set<string>();
  
  Object.entries(snapshot.val()).forEach(([id, allocation]: [string, any]) => {
    const key = `${allocation.truckNumber}-${allocation.product}`;
    if (seen.has(key)) {
      // This is a duplicate, mark for deletion
      updates[`permitPreAllocations/${id}`] = null;
    } else {
      seen.add(key);
    }
  });
  
  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
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
