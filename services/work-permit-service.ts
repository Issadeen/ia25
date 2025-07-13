import { Database, get, ref, set, push, update } from 'firebase/database';
import { WorkOrder, WorkOrderAllocation } from '@/types/work-orders';
import type { WorkDetail } from '@/types/work';
import type { PreAllocation, PermitEntry } from '@/types/permits';
import { checkEntryVolumes, findAvailablePermitEntry } from '@/utils/permit-helpers';

export class WorkPermitService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async allocatePermitForWorkOrder(orderNumber: string): Promise<{success: boolean, error?: string}> {
    try {
      // Get the work order
      const orderRef = ref(this.db, `tr800/${orderNumber}`);
      const orderSnapshot = await get(orderRef);

      if (!orderSnapshot.exists()) {
        return { success: false, error: `Work order ${orderNumber} not found` };
      }

      const order = orderSnapshot.val() as WorkOrder;

      // Check if this order is eligible for a permit
      if (order.destination.toLowerCase() !== 'ssd') {
        return { success: true }; // Not an error, just not eligible
      }

      // Find an available permit
      const permitsRef = ref(this.db, 'permits');
      const permitsSnapshot = await get(permitsRef);

      if (!permitsSnapshot.exists()) {
        return { success: false, error: 'No permits available in the system' };
      }

      let availablePermit: any = null;
      let permitId: string = '';

      permitsSnapshot.forEach((childSnapshot) => {
        const permit = childSnapshot.val();
        if (permit.status === 'available' && !availablePermit) {
          availablePermit = permit;
          permitId = childSnapshot.key!;
        }
      });

      if (!availablePermit) {
        return { success: false, error: 'No available permits found' };
      }

      // Allocate the permit
      const updates: any = {};
      updates[`permits/${permitId}/status`] = 'allocated';
      updates[`permits/${permitId}/allocatedTo`] = orderNumber;
      updates[`permits/${permitId}/allocatedAt`] = Date.now();
      updates[`permits/${permitId}/truck`] = order.truck || null;
      updates[`permits/${permitId}/depot`] = order.depot || null;
      updates[`tr800/${orderNumber}/permitId`] = permitId;

      await update(ref(this.db), updates);
      
      return { success: true };
    } catch (error) {
      console.error('Error allocating permit:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error allocating permit' 
      };
    }
  }

  async allocatePermitForWorkDetail(workDetailId: string): Promise<{ success: boolean; error?: string }> {
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
