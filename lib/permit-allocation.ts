import { Database, ref, update, push, get, query, orderByChild, equalTo } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';
import { getPermitEntryStatus, validatePermitEntry } from '@/utils/permit-helpers';

export const preAllocatePermitEntry = async (
  db: Database,
  truckNumber: string,
  product: string,
  owner: string,
  permitEntryId: string,
  permitEntryNumber: string,
  quantity?: number // Make quantity optional, default to work detail quantity
): Promise<PreAllocation> => {
  try {
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

    const permitData = permitSnapshot.val();
    const currentPreAllocated = permitData.preAllocatedQuantity || 0;
    
    // Calculate actual available volume
    const totalVolume = permitData.remainingQuantity;
    const existingAllocations = preAllocationsSnapshot.exists() 
      ? Object.values(preAllocationsSnapshot.val()).reduce((sum: number, alloc: any) => 
          alloc.permitEntryId === permitEntryId ? sum + (alloc.quantity || 0) : sum, 0)
      : 0;

    const actualAvailableVolume = totalVolume - existingAllocations;

    console.info('Volume check:', {
      totalVolume,
      existingAllocations,
      actualAvailableVolume,
      currentPreAllocated
    });

    if (!workSnapshot.exists()) {
      throw new Error('Work detail not found for truck');
    }

    const workDetail = Object.values(workSnapshot.val())[0] as any;
    const requiredQuantity = quantity || parseFloat(workDetail.quantity) * 1000;
    
    // Log only essential information
    if (process.env.NODE_ENV === 'development') {
      console.info(`Pre-allocating permit for truck ${truckNumber}:`, {
        permitNumber: permitEntryNumber,
        quantity: requiredQuantity,
        available: permitData.remainingQuantity - currentPreAllocated
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
    const preAllocationRef = push(ref(db, 'permitPreAllocations'));
    
    const preAllocation: PreAllocation = {
      id: preAllocationRef.key!,
      truckNumber,
      product,
      owner,
      permitEntryId,
      permitNumber: permitEntryNumber,
      quantity: requiredQuantity,
      allocatedAt: new Date().toISOString()
    };

    // Update permit entry with pre-allocation tracking
    const updates: { [key: string]: any } = {
      [`permitPreAllocations/${preAllocationRef.key}`]: preAllocation,
      [`allocations/${permitEntryId}/preAllocatedQuantity`]: currentPreAllocated + requiredQuantity,
      [`allocations/${permitEntryId}/lastUpdated`]: new Date().toISOString(),
      [`work_details/${workDetail.id}/permitAllocated`]: true,
      [`work_details/${workDetail.id}/permitNumber`]: permitEntryNumber,
      [`work_details/${workDetail.id}/permitEntryId`]: permitEntryId
    };

    await update(ref(db), updates);
    return preAllocation;
    
  } catch (error) {
    console.error('Pre-allocation failed:', {
      truck: truckNumber,
      permitEntry: permitEntryNumber,
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
