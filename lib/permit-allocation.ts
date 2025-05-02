import { Database, ref, set, get, update, DatabaseReference, query, orderByChild, equalTo } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';
import { checkEntryVolumes, VolumeCheck } from '@/utils/permit-helpers'; // Import checkEntryVolumes

// Helper function to generate unique allocation IDs
const generateAllocationId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}`;
};

export const preAllocatePermitEntry = async (
  db: Database,
  truckNumber: string,
  product: string,
  owner: string,
  permitEntryId: string,
  permitNumber: string,
  destination: string,
  quantity: number // Make quantity mandatory and specific for this allocation
): Promise<{ success: boolean; data?: PreAllocation; error?: string }> => {
  try {
    // 1. Validate input quantity
    if (!quantity || quantity <= 0) {
      return { success: false, error: "Allocation quantity must be positive" };
    }

    // 2. Check existing pre-allocations for the same truck/destination (optional but good practice)
    // This prevents accidentally allocating twice to the same truck for the same destination run
    const existingAllocRef = query(
        ref(db, 'permitPreAllocations'), 
        orderByChild('truckNumber'), 
        equalTo(truckNumber)
    );
    const snapshot = await get(existingAllocRef);
    if (snapshot.exists()) {
      const existingAllocation = (Object.values(snapshot.val()) as PreAllocation[]).find(
        (alloc) => 
          !alloc.used &&
          alloc.destination?.toLowerCase() === destination.toLowerCase() &&
          alloc.product?.toLowerCase() === product.toLowerCase() // Also check product
      );
      
      if (existingAllocation) {
         // Allow adding to existing allocation if needed, or throw error.
         // For now, let's prevent duplicates for simplicity.
         console.warn(`Truck ${truckNumber} already has an active permit allocation for ${product} to ${destination}.`);
         // Depending on requirements, you might want to update the existing one or throw an error.
         // Let's throw an error to prevent accidental duplicates during multi-allocation.
         return { success: false, error: `Truck ${truckNumber} already has an active permit allocation for ${product} to ${destination}` };
      }
    }

    // 3. Check available volume using the reliable checkEntryVolumes function
    const volumeCheck: VolumeCheck = await checkEntryVolumes(db, permitEntryId);

    if (!volumeCheck.isValid) {
       return { success: false, error: `Permit entry ${permitNumber} (${permitEntryId}) has inconsistent volume data.` };
    }
    
    if (volumeCheck.remainingVolume < quantity) {
      console.error(`Insufficient volume for allocation: Entry ${permitNumber} (${permitEntryId}), Available: ${volumeCheck.remainingVolume}, Required: ${quantity}`);
      return { success: false, error: `Insufficient volume in permit ${permitNumber}. Available: ${volumeCheck.remainingVolume.toLocaleString()} L, Required: ${quantity.toLocaleString()} L` };
    }

    // 4. Create the new pre-allocation entry
    const allocationId = generateAllocationId();
    const newAllocRef = ref(db, `permitPreAllocations/${allocationId}`);
    const allocData: PreAllocation = {
      id: allocationId, // Store the ID within the object as well
      truckNumber,
      product,
      owner,
      permitEntryId,
      permitNumber,
      destination: destination.toLowerCase(),
      quantity: quantity, // Use the specific quantity for this allocation
      allocatedAt: new Date().toISOString(),
      used: false,
      timestamp: undefined
    };

    await set(newAllocRef, allocData);

    console.log(`Successfully pre-allocated ${quantity}L from ${permitNumber} (${permitEntryId}) to ${truckNumber} for ${destination}`);
    return { success: true, data: allocData };

  } catch (error) {
    console.error('[Permit Allocation Error]:', {
      truck: truckNumber,
      permit: permitNumber,
      entryId: permitEntryId,
      quantity: quantity,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Re-throw or return error structure
    return { success: false, error: error instanceof Error ? error.message : 'Unknown allocation error' };
  }
};

export const markPermitAsUsed = async (db: Database, allocationId: string) => {
  const updates: { [key: string]: any } = {};
  updates[`permitPreAllocations/${allocationId}/used`] = true;
  updates[`permitPreAllocations/${allocationId}/usedAt`] = new Date().toISOString();
  
  await update(ref(db), updates);
};

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
    // Get current allocations for the truck
    const preAllocationsQuery = query(
        ref(db, 'permitPreAllocations'), 
        orderByChild('truckNumber'), 
        equalTo(truckNumber)
    );
    const preAllocationsSnapshot = await get(preAllocationsQuery);

    if (preAllocationsSnapshot.exists()) {
      const updates: Record<string, any> = {};
      
      // Identify pre-allocations to remove
      preAllocationsSnapshot.forEach((snapshot) => {
        const allocation = snapshot.val() as PreAllocation;
        // Only remove active (not used) allocations matching the criteria
        if (!allocation.used && (!destination || allocation.destination?.toLowerCase() === destination.toLowerCase())) {
          updates[`permitPreAllocations/${snapshot.key}`] = null; // Mark for deletion
        }
      });

      // Reset corresponding work detail permit status if needed
      const workSnapshot = await get(
        query(ref(db, 'work_details'), 
          orderByChild('truck_number'), 
          equalTo(truckNumber)
        )
      );

      if (workSnapshot.exists()) {
        workSnapshot.forEach((childSnapshot) => {
          const workDetail = childSnapshot.val();
          // Reset if we removed allocations matching the work detail's destination,
          // or if we removed all allocations for the truck (destination filter was not provided)
          if (!destination || workDetail.permitDestination?.toLowerCase() === destination?.toLowerCase()) {
             if (Object.keys(updates).length > 0) { // Only reset if we actually removed something
                updates[`work_details/${childSnapshot.key}/permitAllocated`] = false;
                updates[`work_details/${childSnapshot.key}/permitNumbers`] = null;
                updates[`work_details/${childSnapshot.key}/permitEntryIds`] = null;
                updates[`work_details/${childSnapshot.key}/permitDestination`] = null;
             }
          }
        });
      }

      // Apply deletions and work detail updates
      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
        console.log(`Reset allocations for truck ${truckNumber}` + (destination ? ` for destination ${destination}` : ''));
      }
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
      console.warn(`Pre-allocation ${preAllocationId} not found for release.`);
      return; // Not an error, just nothing to release
    }

    const allocationData = snapshot.val() as PreAllocation;
    const { truckNumber, destination, product } = allocationData; // Get details before deleting

    // Prepare updates object
    const updates: Record<string, any> = {};

    // 1. Mark pre-allocation for deletion
    updates[`permitPreAllocations/${preAllocationId}`] = null;
    console.log(`Marked pre-allocation ${preAllocationId} for deletion.`);

    // 2. Find and mark corresponding work_details for reset
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
          // Find the work detail that matches the allocation's destination and product
          // and is currently marked as allocated
          if (
            workDetail.destination?.toLowerCase() === destination.toLowerCase() &&
            workDetail.product?.toLowerCase() === product.toLowerCase() &&
            workDetail.permitAllocated === true // Only reset if it was marked as allocated
          ) {
            workDetailKey = childSnapshot.key;
          }
        });

        if (workDetailKey) {
          console.log(`Found matching work detail ${workDetailKey} for truck ${truckNumber}. Resetting permit status.`);
          updates[`work_details/${workDetailKey}/permitAllocated`] = false;
          updates[`work_details/${workDetailKey}/permitNumbers`] = null;
          updates[`work_details/${workDetailKey}/permitEntryIds`] = null;
          updates[`work_details/${workDetailKey}/permitDestination`] = null; // Clear destination tied to permit
        } else {
          console.warn(`Could not find a matching, allocated work detail for truck ${truckNumber}, destination ${destination}, product ${product} to reset.`);
        }
      } else {
         console.warn(`No work details found for truck ${truckNumber} during release.`);
      }
    } else {
       console.warn(`Pre-allocation ${preAllocationId} missing truckNumber, destination, or product. Cannot reset work detail.`);
    }


    // 3. Apply all updates
    if (Object.keys(updates).length > 0) {
       await update(ref(db), updates);
       console.log(`Successfully processed release for pre-allocation ${preAllocationId}.`);
    }

  } catch (error) {
    console.error(`Error releasing pre-allocation ${preAllocationId}:`, error);
    throw error; // Re-throw error to be caught by the UI handler
  }
};

export const cleanupOrphanedAllocations = async (db: Database) => {
  try {
    const [workDetailsSnap, preAllocationsSnap] = await Promise.all([
      get(ref(db, 'work_details')),
      get(ref(db, 'permitPreAllocations'))
    ]);

    if (!preAllocationsSnap.exists()) return { success: true, cleaned: 0 };

    const updates: { [key: string]: null } = {};
    const activeWorkTrucks = new Set<string>();
    if (workDetailsSnap.exists()) {
        Object.values(workDetailsSnap.val()).forEach((detail: any) => {
            if (detail.truck_number) { // Consider adding a status check if needed (e.g., only active trucks)
                activeWorkTrucks.add(detail.truck_number);
            }
        });
    }

    let cleanedCount = 0;
    preAllocationsSnap.forEach((child) => {
      const allocation = child.val() as PreAllocation;
      // Remove if the truck doesn't exist in work_details or if the allocation is unused
      if (!allocation.used && !activeWorkTrucks.has(allocation.truckNumber)) {
        updates[`permitPreAllocations/${child.key}`] = null;
        cleanedCount++;
        console.log(`Cleaning orphaned allocation ${child.key} for non-existent/inactive truck ${allocation.truckNumber}`);
      }
    });
    
    // Add cleanup for loaded trucks logic (from original code, seems reasonable)
    const loadedTrucks = new Map<string, { loadedAt: string; destination: string }>();
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
      const allocation = child.val() as PreAllocation;
      const loadInfo = loadedTrucks.get(allocation.truckNumber);
      
      if (loadInfo && !allocation.used) { // Only clean if not already marked used
        const loadedTime = new Date(loadInfo.loadedAt).getTime();
        const allocationTime = new Date(allocation.allocatedAt).getTime();
        
        // Clean up if truck loaded for the same destination after allocation, outside grace period
        if (
          loadInfo.destination === allocation.destination?.toLowerCase() &&
          loadedTime > allocationTime &&
          (now - loadedTime) > GRACE_PERIOD 
        ) {
          if (!updates[`permitPreAllocations/${child.key}`]) { // Avoid double counting
             updates[`permitPreAllocations/${child.key}`] = null;
             cleanedCount++;
             console.log(`Cleaning up allocation ${child.key} for ${allocation.truckNumber} (loaded: ${loadInfo.loadedAt} for same destination)`);
          }
        }
      }
      
      // Clean up very old allocations (e.g., > 48 hours)
      const allocationAge = now - new Date(allocation.allocatedAt).getTime();
      if (allocationAge > 48 * 60 * 60 * 1000 && !allocation.used) {
         if (!updates[`permitPreAllocations/${child.key}`]) { 
            updates[`permitPreAllocations/${child.key}`] = null;
            cleanedCount++;
            console.log(`Cleaning up old allocation ${child.key} for ${allocation.truckNumber} (age: ${Math.round(allocationAge/3600000)}h)`);
         }
      }
    });


    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      return { success: true, cleaned: cleanedCount };
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
  product: string,
  destination: string // Add destination for consolidation scope
): Promise<void> => {
  const preAllocationsRef = ref(db, 'permitPreAllocations');
  const snapshot = await get(preAllocationsRef);
  
  if (!snapshot.exists()) return;
  
  const allocations = Object.entries(snapshot.val())
    .map(([key, data]) => {
      const allocation = data as PreAllocation;
      return { ...allocation, id: key }; // Override the id with the Firebase key
    })
    .filter((a) => 
      a.truckNumber === truckNumber && 
      a.product === product && 
      a.destination?.toLowerCase() === destination.toLowerCase() && // Match destination
      !a.used
    )
    .sort((a, b) => new Date(a.allocatedAt).getTime() - new Date(b.allocatedAt).getTime()); // Sort by allocation time

  if (allocations.length <= 1) return; // Nothing to consolidate
  
  // Consolidate into the first (oldest) allocation
  const primary = allocations[0];
  const updates: { [key: string]: any } = {};
  let totalQuantity = primary.quantity || 0; // Start with primary quantity
  
  // Sum up quantities and mark others for deletion
  allocations.slice(1).forEach(allocation => {
    totalQuantity += allocation.quantity || 0;
    updates[`permitPreAllocations/${allocation.id}`] = null; // Mark for deletion
  });
  
  // Update the primary allocation with total quantity if it changed
  if (totalQuantity !== primary.quantity) {
     updates[`permitPreAllocations/${primary.id}/quantity`] = totalQuantity;
  }
  
  if (Object.keys(updates).length > 0) {
     await update(ref(db), updates);
     console.log(`Consolidated ${allocations.length} allocations for ${truckNumber}/${product}/${destination} into ${primary.id}`);
  }
};

export const checkTruckPermitAllocation = async (
  db: Database, 
  truckNumber: string,
  destination: string,
  product: string
): Promise<PreAllocation | null> => { // Return type includes id
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
      if (permitId && // Ensure key exists
          !permit.used &&
          permit.destination?.toLowerCase() === destination.toLowerCase() &&
          permit.product.toLowerCase() === product.toLowerCase()) {
        
        // If multiple matches found (shouldn't happen often with consolidation/checks), take the first? Or log warning?
        // For now, take the first one found (iteration order isn't guaranteed, but query helps)
        if (!allocation) { 
            allocation = {
              ...permit,
              id: permitId // Ensure ID is part of the returned object
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

export const cleanupZeroQuantityAllocations = async (db: Database): Promise<number> => {
  try {
    const allocRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(allocRef);
    
    if (!snapshot.exists()) return 0;
    
    const updates: { [key: string]: null } = {};
    let cleanupCount = 0;
    
    snapshot.forEach((child) => {
      const allocation = child.val() as PreAllocation;
      // Clean up if quantity is zero, null, undefined, or negative
      if (!allocation.quantity || allocation.quantity <= 0) { 
        updates[`permitPreAllocations/${child.key}`] = null;
        cleanupCount++;
      }
    });
    
    if (cleanupCount > 0) {
      await update(ref(db), updates);
      console.log(`Cleaned up ${cleanupCount} zero-quantity or invalid-quantity allocations`);
    }
    
    return cleanupCount;
  } catch (error) {
    console.error('Error cleaning up zero-quantity allocations:', error);
    throw error;
  }
};
