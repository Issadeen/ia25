import { Database, ref, get, update, query, orderByChild, equalTo } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';
import { checkEntryVolumes, validatePermitAllocation } from '@/utils/permit-helpers';

export const preAllocatePermitEntry = async (
  db: Database,
  truckNumber: string,
  product: string,
  owner: string,
  permitEntryId: string,
  permitNumber: string,
  destination: string,
  quantity: number
): Promise<{ success: boolean; data?: PreAllocation; error?: string }> => {
  try {
    // 1. Check for existing allocations
    const existingAllocation = await checkTruckPermitAllocation(db, truckNumber, destination, product);
    if (existingAllocation) {
      return { 
        success: false, 
        error: `Truck ${truckNumber} already has an active allocation for ${product} to ${destination}` 
      };
    }

    // 2. Get and validate permit entry
    const entryRef = ref(db, `allocations/${permitEntryId}`);
    const entrySnap = await get(entryRef);
    if (!entrySnap.exists()) {
      return { success: false, error: 'Permit entry not found' };
    }

    const entry = { id: permitEntryId, ...entrySnap.val() } as PermitEntry;
    const validation = validatePermitAllocation(entry, quantity, destination);
    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // 3. Check volume availability
    const volumeCheck = await checkEntryVolumes(db, permitEntryId);
    if (!volumeCheck.isValid || volumeCheck.remainingVolume < quantity) {
      return { 
        success: false, 
        error: `Insufficient volume. Available: ${volumeCheck.remainingVolume}, Requested: ${quantity}` 
      };
    }

    // 4. Create allocation with proper typing
    const allocationId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const allocation: PreAllocation = {
      id: allocationId,
      truckNumber,
      product,
      owner,
      permitEntryId,
      permitNumber,
      destination: destination.toLowerCase(),
      quantity,
      allocatedAt: new Date().toISOString(),
      used: false,
      timestamp: Date.now() // Optional field
    };

    // 5. Update database
    const updates: Record<string, any> = {
      [`permitPreAllocations/${allocationId}`]: allocation,
      [`allocations/${permitEntryId}/preAllocatedQuantity`]: (entry.preAllocatedQuantity || 0) + quantity
    };

    await update(ref(db), updates);
    return { success: true, data: allocation };

  } catch (error) {
    console.error('Permit allocation error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during allocation' 
    };
  }
};

export const checkTruckPermitAllocation = async (
  db: Database, 
  truckNumber: string,
  destination: string,
  product: string
): Promise<PreAllocation | null> => {
  try {
    const permitRef = query(
        ref(db, 'permitPreAllocations'), 
        orderByChild('truckNumber'), 
        equalTo(truckNumber)
    );
    const snapshot = await get(permitRef);
    
    if (!snapshot.exists()) return null;
    
    let allocation: PreAllocation | null = null;
    snapshot.forEach((child) => {
      const permit = child.val() as PreAllocation;
      const permitId = child.key;
      if (permitId &&
          !permit.used &&
          permit.destination?.toLowerCase() === destination.toLowerCase() &&
          permit.product.toLowerCase() === product.toLowerCase()) {
        if (!allocation) { 
            allocation = {
              ...permit,
              id: permitId
            };
        } else {
            console.warn(`Multiple active allocations found for ${truckNumber}/${product}/${destination}. Using first found: ${allocation.id}`);
        }
      }
    });
    
    return allocation;
  } catch (error) {
    console.error('Error checking permit allocation:', error);
    return null;
  }
};

// Helper to type-guard work detail objects
interface WorkDetailBase {
  key?: string;
  truck_number?: string;
  destination?: string;
  product?: string;
  permitAllocated?: boolean;
}

export const findWorkDetail = async (
  db: Database,
  truckNumber: string,
  destination: string,
  product: string
): Promise<WorkDetailBase | null> => {
  const workQuery = query(
    ref(db, 'work_details'),
    orderByChild('truck_number'),
    equalTo(truckNumber)
  );

  const snapshot = await get(workQuery);
  if (!snapshot.exists()) return null;

  let foundDetail: WorkDetailBase | null = null;
  snapshot.forEach((child) => {
    const detail = child.val() as WorkDetailBase;
    if (detail.destination?.toLowerCase() === destination.toLowerCase() &&
        detail.product?.toLowerCase() === product.toLowerCase()) {
      foundDetail = { ...detail, key: child.key };
    }
  });

  return foundDetail;
};

export const releasePreAllocation = async (
  db: Database,
  preAllocationId: string
): Promise<void> => {
  try {
    const preAllocationRef = ref(db, `permitPreAllocations/${preAllocationId}`);
    const snapshot = await get(preAllocationRef);

    if (!snapshot.exists()) {
      console.warn(`Pre-allocation ${preAllocationId} not found for release.`);
      return;
    }

    const allocationData = snapshot.val() as PreAllocation;
    const { truckNumber, destination, product } = allocationData;

    const updates: Record<string, any> = {};
    updates[`permitPreAllocations/${preAllocationId}`] = null;

    if (truckNumber && destination && product) {
      const workDetailsQuery = query(
        ref(db, 'work_details'),
        orderByChild('truck_number'),
        equalTo(truckNumber)
      );
      const workSnapshot = await get(workDetailsQuery);

      if (workSnapshot.exists()) {
        let workDetailKey: string | null = null;
        workSnapshot.forEach((childSnapshot) => {
          const workDetail = childSnapshot.val();
          if (
            workDetail.destination?.toLowerCase() === destination.toLowerCase() &&
            workDetail.product?.toLowerCase() === product.toLowerCase() &&
            workDetail.permitAllocated === true
          ) {
            workDetailKey = childSnapshot.key;
          }
        });

        if (workDetailKey) {
          updates[`work_details/${workDetailKey}/permitAllocated`] = false;
          updates[`work_details/${workDetailKey}/permitNumbers`] = null;
          updates[`work_details/${workDetailKey}/permitEntryIds`] = null;
          updates[`work_details/${workDetailKey}/permitDestination`] = null;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
       await update(ref(db), updates);
    }

  } catch (error) {
    console.error(`Error releasing pre-allocation ${preAllocationId}:`, error);
    throw error;
  }
};

export const cleanupOrphanedAllocations = async (
  db: Database
): Promise<{ success: boolean; cleaned: number; error?: string }> => {
  try {
    const [workDetailsSnap, preAllocationsSnap] = await Promise.all([
      get(ref(db, 'work_details')),
      get(ref(db, 'permitPreAllocations'))
    ]);

    if (!preAllocationsSnap.exists()) {
      return { success: true, cleaned: 0 };
    }

    const updates: Record<string, null> = {};
    const activeWorkTrucks = new Set<string>();

    // Build set of active trucks
    if (workDetailsSnap.exists()) {
      Object.values(workDetailsSnap.val()).forEach((detail: any) => {
        if (detail.truck_number) {
          activeWorkTrucks.add(detail.truck_number);
        }
      });
    }

    // Find orphaned allocations
    let cleanedCount = 0;
    preAllocationsSnap.forEach((child) => {
      const allocation = child.val() as PreAllocation;
      if (!allocation.used && !activeWorkTrucks.has(allocation.truckNumber)) {
        updates[`permitPreAllocations/${child.key}`] = null;
        cleanedCount++;
      }
    });

    // Apply updates if any found
    if (cleanedCount > 0) {
      await update(ref(db), updates);
      console.log(`[Cleanup] Removed ${cleanedCount} orphaned allocations`);
    }

    return { success: true, cleaned: cleanedCount };

  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return { 
      success: false, 
      cleaned: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};
