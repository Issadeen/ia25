import { Database, ref, get, update, remove } from 'firebase/database';

interface PermitPreAllocation {
  permitEntryId: string;
  workDetailId?: string;
  truckNumber: string;
}

export const resetPermitSystem = async (db: Database): Promise<{ success: boolean; message: string }> => {
  try {
    // 1. Get all pre-allocations to find which entries need resetting
    const preAllocationsRef = ref(db, 'permitPreAllocations');
    const preAllocationsSnapshot = await get(preAllocationsRef);
    
    const updates: { [key: string]: any } = {};
    
    if (preAllocationsSnapshot.exists()) {
      // 2. Reset all affected permit entries
      const preAllocations = Object.values(preAllocationsSnapshot.val() as Record<string, PermitPreAllocation>);
      
      for (const allocation of preAllocations) {
        // Reset pre-allocated quantity for each affected entry
        updates[`allocations/${allocation.permitEntryId}/preAllocatedQuantity`] = 0;
        updates[`allocations/${allocation.permitEntryId}/lastUpdated`] = new Date().toISOString();
        
        // Reset work detail permit flags if they exist
        if (allocation.workDetailId) {
          updates[`work_details/${allocation.workDetailId}/permitAllocated`] = false;
          updates[`work_details/${allocation.workDetailId}/permitNumber`] = null;
          updates[`work_details/${allocation.workDetailId}/permitEntryId`] = null;
        }
      }
      
      // 3. Delete all pre-allocations
      updates['permitPreAllocations'] = null;
    }

    // 4. Apply all updates
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }

    return {
      success: true,
      message: "Permit system reset successfully"
    };
  } catch (error) {
    console.error('Reset error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to reset permit system"
    };
  }
};
