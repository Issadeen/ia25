import { Database, ref, get, update, remove } from 'firebase/database';
import { cleanupDuplicateAllocations } from './permit-cleanup';

interface PermitPreAllocation {
  permitEntryId: string;
  workDetailId?: string;
  truckNumber: string;
}

export const resetPermitSystem = async (db: Database): Promise<{ success: boolean; message: string }> => {
  try {
    // First run cleanup to handle loaded trucks
    await cleanupDuplicateAllocations(db);

    // Then check if any issues remain
    const preAllocationsRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(preAllocationsRef);

    if (snapshot.exists()) {
      const preAllocations = snapshot.val();
      const remainingCount = Object.keys(preAllocations).length;

      if (remainingCount > 0) {
        return {
          success: false,
          message: `Found ${remainingCount} remaining pre-allocations. Please check and remove manually.`
        };
      }
    }

    return {
      success: true,
      message: 'Permit system reset successfully'
    };
  } catch (error) {
    console.error('Reset error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during reset'
    };
  }
};
