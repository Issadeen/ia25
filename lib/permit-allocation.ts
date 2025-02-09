import { Database, ref, update, push, get, query, orderByChild, equalTo, set } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';
import { getPermitEntryStatus, validatePermitEntry } from '@/utils/permit-helpers';

export const preAllocatePermitEntry = async (
  db: Database,
  truckNumber: string,
  product: string,
  owner: string,
  permitEntryId: string,
  permitEntryNumber: string,
  quantity: number // Add this parameter
): Promise<PreAllocation> => {
  try {
    // Convert quantity to liters if in thousands
    const quantityInLiters = quantity < 1000 ? quantity * 1000 : quantity;

    // Check if truck already has an allocation
    const existingAllocationSnapshot = await get(
      query(ref(db, 'permitPreAllocations'), 
        orderByChild('truckNumber'), 
        equalTo(truckNumber)
      )
    );

    if (existingAllocationSnapshot.exists()) {
      throw new Error('Truck already has a permit allocation');
    }

    // Get all data in parallel
    const [permitSnapshot, workSnapshot, preAllocationsSnapshot] = await Promise.all([
      get(ref(db, `allocations/${permitEntryId}`)),
      get(query(ref(db, 'work_details'), orderByChild('truck_number'), equalTo(truckNumber))),
      get(ref(db, 'permitPreAllocations'))
    ]);

    if (!permitSnapshot.exists()) {
      throw new Error('Permit entry not found');
    }

    if (!workSnapshot.exists()) {
      throw new Error('Work detail not found for truck');
    }

    const workDetail = Object.values(workSnapshot.val())[0] as any;
    const permitData = permitSnapshot.val();
    const currentPreAllocated = permitData.preAllocatedQuantity || 0;
    
    // Calculate required quantity first
    const requiredQuantity = quantityInLiters || parseFloat(workDetail.quantity) * 1000;
    
    // Calculate actual available volume
    const totalVolume = permitData.remainingQuantity;
    const existingAllocations = preAllocationsSnapshot.exists() 
      ? Object.values(preAllocationsSnapshot.val()).reduce((sum: number, alloc: any) => 
          alloc.permitEntryId === permitEntryId ? sum + (alloc.quantity || 0) : sum, 0)
      : 0;

    const actualAvailableVolume = totalVolume - existingAllocations;

    if (process.env.NODE_ENV === 'development') {
      console.info(`[Permit Allocation] ${truckNumber}:`, {
        product,
        required: requiredQuantity,
        available: actualAvailableVolume,
        permitNumber: permitEntryNumber
      });
    }

    // Check if there's enough remaining volume
    const availableQuantity = permitData.remainingQuantity - currentPreAllocated;
    if (actualAvailableVolume < requiredQuantity) {
      throw new Error(
        `Insufficient available volume. Required: ${requiredQuantity}, ` +
        `Available: ${actualAvailableVolume} ` +
        `(Total: ${totalVolume}, Allocated: ${existingAllocations})`
      );
    }

    // Create pre-allocation record
    const newPreAllocationRef = ref(db, `permitPreAllocations/${truckNumber}-${Date.now()}`);
    
    const preAllocation: PreAllocation = {
      id: `${truckNumber}-${Date.now()}`,
      truckNumber,
      product,
      owner,
      permitEntryId,
      permitNumber: permitEntryNumber,
      quantity: requiredQuantity,
      allocatedAt: new Date().toISOString(),
      used: false
    };

    await set(newPreAllocationRef, preAllocation);

    // Update permit entry with pre-allocation tracking
    const updates: { [key: string]: any } = {
      [`permitPreAllocations/${newPreAllocationRef.key}`]: preAllocation,
      [`allocations/${permitEntryId}/preAllocatedQuantity`]: currentPreAllocated + requiredQuantity,
      [`allocations/${permitEntryId}/lastUpdated`]: new Date().toISOString(),
      [`work_details/${workDetail.id}/permitAllocated`]: true,
      [`work_details/${workDetail.id}/permitNumber`]: permitEntryNumber,
      [`work_details/${workDetail.id}/permitEntryId`]: permitEntryId
    };

    await update(ref(db), updates);
    return preAllocation;
    
  } catch (error) {
    console.error('[Permit Allocation Error]:', {
      truck: truckNumber,
      permit: permitEntryNumber,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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

// Update release function for entries node
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

// Add cleanup function to remove orphaned allocations
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

// Add this to your existing file
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

export const resetTruckAllocation = async (
  db: Database,
  truckNumber: string
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
      
      // Remove all allocations for this truck
      Object.entries(preAllocationsSnapshot.val()).forEach(([key, allocation]: [string, any]) => {
        updates[`permitPreAllocations/${key}`] = null;
      });

      // Reset work detail permit status
      const workSnapshot = await get(
        query(ref(db, 'work_details'), 
          orderByChild('truck_number'), 
          equalTo(truckNumber)
        )
      );

      if (workSnapshot.exists()) {
        const [workId] = Object.keys(workSnapshot.val());
        updates[`work_details/${workId}/permitAllocated`] = false;
        updates[`work_details/${workId}/permitNumber`] = null;
        updates[`work_details/${workId}/permitEntryId`] = null;
      }

      await update(ref(db), updates);
    }
  } catch (error) {
    console.error('Error resetting truck allocation:', error);
    throw error;
  }
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
