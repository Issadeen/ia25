import { Database, ref, get, update, query, orderByChild, equalTo } from 'firebase/database';
import type { PreAllocation, PermitEntry } from '@/types/permits';
import type { WorkDetail } from '@/types/work';
import { checkEntryVolumes } from '@/utils/permit-helpers';

export class WorkAllocationService {
  constructor(private db: Database) {}

  async allocatePermitToWorkOrder(
    workDetailId: string,
    permitEntryId: string,
    quantity: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Get work detail and permit entry
      const [workDetail, permitEntry] = await Promise.all([
        get(ref(this.db, `work_details/${workDetailId}`)),
        get(ref(this.db, `allocations/${permitEntryId}`))
      ]);

      if (!workDetail.exists()) {
        return { success: false, error: 'Work order not found' };
      }
      if (!permitEntry.exists()) {
        return { success: false, error: 'Permit entry not found' };
      }

      const work = workDetail.val() as WorkDetail;
      const permit = permitEntry.val() as PermitEntry;

      // 2. Check volumes
      const volumeCheck = await checkEntryVolumes(this.db, permitEntryId);
      if (!volumeCheck.isValid || volumeCheck.remainingVolume < quantity) {
        return { 
          success: false, 
          error: `Insufficient permit volume. Available: ${volumeCheck.remainingVolume}L` 
        };
      }

      // 3. Create allocation
      const allocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const allocation: PreAllocation = {
        id: allocationId,
        truckNumber: work.truck_number!,
        product: work.product!,
        owner: work.owner || 'Unknown',
        permitEntryId,
        permitNumber: permit.number,
        destination: work.destination!.toLowerCase(),
        quantity,
        allocatedAt: new Date().toISOString(),
        used: false
      };

      // 4. Update both work detail and create allocation atomically
      const updates: Record<string, any> = {
        [`permitPreAllocations/${allocationId}`]: allocation,
        [`work_details/${workDetailId}/permitAllocated`]: true,
        [`work_details/${workDetailId}/permitEntryId`]: permitEntryId,
        [`work_details/${workDetailId}/permitNumber`]: permit.number,
        [`allocations/${permitEntryId}/preAllocatedQuantity`]: (permit.preAllocatedQuantity || 0) + quantity
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

  async releaseWorkOrderAllocation(workDetailId: string): Promise<void> {
    const workDetail = await get(ref(this.db, `work_details/${workDetailId}`));
    if (!workDetail.exists()) return;

    const work = workDetail.val() as WorkDetail;
    if (!work.permitEntryId) return;

    // Find and remove allocation
    const allocQuery = query(
      ref(this.db, 'permitPreAllocations'),
      orderByChild('truckNumber'),
      equalTo(work.truck_number!)
    );

    const allocSnapshot = await get(allocQuery);
    if (!allocSnapshot.exists()) return;

    const updates: Record<string, any> = {
      [`work_details/${workDetailId}/permitAllocated`]: false,
      [`work_details/${workDetailId}/permitEntryId`]: null,
      [`work_details/${workDetailId}/permitNumber`]: null
    };

    allocSnapshot.forEach(child => {
      const alloc = child.val() as PreAllocation;
      if (alloc.permitEntryId === work.permitEntryId && !alloc.used) {
        updates[`permitPreAllocations/${child.key}`] = null;
      }
    });

    await update(ref(this.db), updates);
  }
}
