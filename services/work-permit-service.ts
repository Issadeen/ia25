import { Database, ref, get, update, query, orderByChild, equalTo } from 'firebase/database';
import type { WorkDetail } from '@/types/work';
import type { PreAllocation, PermitEntry } from '@/types/permits';
import { checkEntryVolumes, findAvailablePermitEntry } from '@/utils/permit-helpers';

export class WorkPermitService {
  constructor(private db: Database) {}

  async allocatePermitForWorkOrder(workDetailId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Get work detail
      const workSnap = await get(ref(this.db, `work_details/${workDetailId}`));
      if (!workSnap.exists()) {
        return { success: false, error: 'Work order not found' };
      }

      const workDetail = workSnap.val() as WorkDetail;
      
      // 2. Check if already allocated
      if (workDetail.permitAllocated) {
        return { success: false, error: 'Work order already has a permit allocation' };
      }

      // 3. Find available permit
      const availablePermit = await findAvailablePermitEntry(
        this.db,
        workDetail.product,
        Number(workDetail.quantity),
        workDetail.destination
      );

      if (!availablePermit) {
        return { success: false, error: 'No available permit found' };
      }

      // 4. Check volume availability
      const volumeCheck = await checkEntryVolumes(this.db, availablePermit.id);
      if (!volumeCheck.isValid || volumeCheck.remainingVolume < Number(workDetail.quantity)) {
        return { 
          success: false, 
          error: `Insufficient permit volume. Available: ${volumeCheck.remainingVolume}L` 
        };
      }

      // 5. Create allocation
      const allocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const allocation: PreAllocation = {
        id: allocationId,
        truckNumber: workDetail.truck_number,
        product: workDetail.product,
        owner: workDetail.owner,
        permitEntryId: availablePermit.id,
        permitNumber: availablePermit.number,
        destination: workDetail.destination.toLowerCase(),
        quantity: Number(workDetail.quantity),
        allocatedAt: new Date().toISOString(),
        used: false,
        workDetailId // Link to work order
      };

      // 6. Update both work detail and create allocation atomically
      const updates: Record<string, any> = {
        [`permitPreAllocations/${allocationId}`]: allocation,
        [`work_details/${workDetailId}/permitAllocated`]: true,
        [`work_details/${workDetailId}/permitNumber`]: availablePermit.number,
        [`work_details/${workDetailId}/permitEntryId`]: availablePermit.id,
        [`work_details/${workDetailId}/permitDestination`]: workDetail.destination,
        [`work_details/${workDetailId}/permitQuantity`]: Number(workDetail.quantity),
        [`allocations/${availablePermit.id}/preAllocatedQuantity`]: (availablePermit.preAllocatedQuantity || 0) + Number(workDetail.quantity)
      };

      await update(ref(this.db), updates);
      return { success: true };

    } catch (error) {
      console.error('Permit allocation error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}
