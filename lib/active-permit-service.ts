import { Database, ref, get, query, orderByChild, equalTo } from 'firebase/database';
import type { WorkDetail } from '@/types/work';
import type { PreAllocation } from '@/types/permits';

/**
 * Get all work orders that have active permit allocations
 */
export const getActivePermitAllocations = async (
  db: Database
): Promise<WorkDetail[]> => {
  try {
    // Get all work details
    const workRef = ref(db, 'work_details');
    const workSnapshot = await get(workRef);
    
    if (!workSnapshot.exists()) {
      return [];
    }
    
    const activeAllocations: WorkDetail[] = [];
    
    // Filter work orders with active permit allocations
    workSnapshot.forEach((child) => {
      const workOrder = child.val() as WorkDetail;
      const id = child.key;
      
      // Check if the work order has an active permit allocation
      // and hasn't been loaded yet
      if (workOrder.permitAllocated && 
          !workOrder.loaded && 
          workOrder.permitNumber && 
          workOrder.permitEntryId) {
        
        activeAllocations.push({
          ...workOrder,
          id: id as string
        });
      }
    });
    
    // Sort by creation date (newest first)
    return activeAllocations.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    
  } catch (error) {
    console.error('Error getting active permit allocations:', error);
    throw error;
  }
};

/**
 * Get all permit pre-allocations that are still active
 */
export const getActivePreAllocations = async (
  db: Database
): Promise<PreAllocation[]> => {
  try {
    const allocRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(allocRef);
    
    if (!snapshot.exists()) {
      return [];
    }
    
    const activeAllocations: PreAllocation[] = [];
    
    snapshot.forEach((child) => {
      const allocation = child.val() as PreAllocation;
      
      // Only include allocations that haven't been used
      if (!allocation.used) {
        activeAllocations.push({
          ...allocation,
          id: child.key as string
        });
      }
    });
    
    // Sort by allocation date (newest first)
    return activeAllocations.sort((a, b) => 
      new Date(b.allocatedAt).getTime() - new Date(a.allocatedAt).getTime()
    );
    
  } catch (error) {
    console.error('Error getting active pre-allocations:', error);
    throw error;
  }
};

/**
 * Match work orders with their active pre-allocations
 */
export const getActivePermitWithAllocations = async (
  db: Database
): Promise<{
  workOrder: WorkDetail;
  preAllocations: PreAllocation[];
}[]> => {
  try {
    const [workOrders, preAllocations] = await Promise.all([
      getActivePermitAllocations(db),
      getActivePreAllocations(db)
    ]);
    
    return workOrders.map(workOrder => {
      // Find all pre-allocations for this work order
      const matching = preAllocations.filter(preAlloc => 
        preAlloc.truckNumber === workOrder.truck_number &&
        preAlloc.product.toLowerCase() === workOrder.product?.toLowerCase() &&
        preAlloc.destination.toLowerCase() === workOrder.destination?.toLowerCase()
      );
      
      return {
        workOrder,
        preAllocations: matching
      };
    });
    
  } catch (error) {
    console.error('Error matching work orders with allocations:', error);
    throw error;
  }
};

/**
 * Get a specific work order with its active allocations
 */
export const getWorkOrderWithAllocations = async (
  db: Database,
  workOrderId: string
): Promise<{
  workOrder: WorkDetail | null;
  preAllocations: PreAllocation[];
}> => {
  try {
    // Get the specific work order
    const workRef = ref(db, `work_details/${workOrderId}`);
    const workSnapshot = await get(workRef);
    
    if (!workSnapshot.exists()) {
      return { workOrder: null, preAllocations: [] };
    }
    
    const workOrder = {
      ...workSnapshot.val(),
      id: workOrderId
    } as WorkDetail;
    
    // If no permit allocation, return early
    if (!workOrder.permitAllocated) {
      return { workOrder, preAllocations: [] };
    }
    
    // Get all active pre-allocations for this work order
    const preAllocQuery = query(
      ref(db, 'permitPreAllocations'),
      orderByChild('truckNumber'),
      equalTo(workOrder.truck_number)
    );
    
    const preAllocSnapshot = await get(preAllocQuery);
    const preAllocations: PreAllocation[] = [];
    
    if (preAllocSnapshot.exists()) {
      preAllocSnapshot.forEach(child => {
        const preAlloc = child.val() as PreAllocation;
        
        if (!preAlloc.used &&
            preAlloc.product.toLowerCase() === workOrder.product?.toLowerCase() &&
            preAlloc.destination.toLowerCase() === workOrder.destination?.toLowerCase()) {
          preAllocations.push({
            ...preAlloc,
            id: child.key as string
          });
        }
      });
    }
    
    return { workOrder, preAllocations };
    
  } catch (error) {
    console.error(`Error getting work order ${workOrderId} with allocations:`, error);
    throw error;
  }
};

/**
 * Filter active allocations by criteria
 */
export interface AllocationFilter {
  destination?: string;
  product?: string;
  owner?: string;
  startDate?: Date;
  endDate?: Date;
}

export const filterActiveAllocations = async (
  db: Database,
  filter: AllocationFilter
): Promise<WorkDetail[]> => {
  try {
    const allActive = await getActivePermitAllocations(db);
    
    return allActive.filter(work => {
      // Filter by destination if specified
      if (filter.destination && 
          work.destination?.toLowerCase() !== filter.destination.toLowerCase()) {
        return false;
      }
      
      // Filter by product if specified
      if (filter.product && 
          work.product?.toLowerCase() !== filter.product.toLowerCase()) {
        return false;
      }
      
      // Filter by owner if specified
      if (filter.owner && 
          work.owner?.toLowerCase() !== filter.owner.toLowerCase()) {
        return false;
      }
      
      // Filter by date range if specified
      if (filter.startDate || filter.endDate) {
        const createdAt = work.createdAt ? new Date(work.createdAt) : null;
        
        if (!createdAt) return false;
        
        if (filter.startDate && createdAt < filter.startDate) return false;
        if (filter.endDate && createdAt > filter.endDate) return false;
      }
      
      return true;
    });
    
  } catch (error) {
    console.error('Error filtering active allocations:', error);
    throw error;
  }
};

/**
 * Get a specific work order with multi-permit details
 * This handles the case where a single work order has multiple permit entries
 */
export const getMultiPermitWorkOrder = async (
  db: Database,
  workOrderId: string
): Promise<{
  workOrder: WorkDetail | null;
  permitEntries: {
    id: string;
    number: string;
    quantity: number;
    remainingQuantity?: number;
  }[];
}> => {
  try {
    // Get the work order
    const { workOrder, preAllocations } = await getWorkOrderWithAllocations(db, workOrderId);
    
    if (!workOrder || !workOrder.permitEntryId) {
      return { workOrder, permitEntries: [] };
    }
    
    // If this has multiple permit entries
    const permitEntryIds = workOrder.permitEntryId.split(',').map(id => id.trim());
    const permitNumbers = workOrder.permitNumber?.split(',').map(num => num.trim()) || [];
    
    // For each permit entry, get its details
    const permitEntries = await Promise.all(
      permitEntryIds.map(async (entryId, index) => {
        try {
          const entryRef = ref(db, `allocations/${entryId}`);
          const snapshot = await get(entryRef);
          
          if (snapshot.exists()) {
            const entryData = snapshot.val();
            
            // Try to find the corresponding pre-allocation to get the quantity
            const matchingPreAlloc = preAllocations.find(pa => 
              pa.permitEntryId === entryId || 
              pa.permitEntryId?.includes(entryId)
            );
            
            return {
              id: entryId,
              number: permitNumbers[index] || entryData.number,
              quantity: matchingPreAlloc?.quantity || 0,
              remainingQuantity: entryData.remainingQuantity
            };
          }
          
          // If entry doesn't exist, return basic info
          return {
            id: entryId,
            number: permitNumbers[index] || 'Unknown',
            quantity: 0
          };
        } catch (error) {
          console.error(`Error getting permit entry ${entryId}:`, error);
          return {
            id: entryId,
            number: permitNumbers[index] || 'Error',
            quantity: 0
          };
        }
      })
    );
    
    return { workOrder, permitEntries };
    
  } catch (error) {
    console.error(`Error getting multi-permit work order ${workOrderId}:`, error);
    return { workOrder: null, permitEntries: [] };
  }
};
