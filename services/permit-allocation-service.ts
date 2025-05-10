import { Database, ref, get, update, query, orderByChild, equalTo } from 'firebase/database';
import type { PermitEntry, PreAllocation } from '@/types/permits';
import { checkEntryVolumes } from '@/utils/permit-helpers';

// Add interface for work details
interface WorkDetail {
  truck_number?: string;
  destination?: string;
  product?: string;
  permitAllocated?: boolean;
  permitNumbers?: string[];
  permitEntryIds?: string[];
}

interface WorkDetailWithKey extends WorkDetail {
  key: string;
}

export class PermitAllocationService {
  constructor(private db: Database) {}

  async allocatePermit(
    truckNumber: string,
    product: string,
    owner: string,
    permitEntryId: string,
    permitNumber: string,
    destination: string,
    quantity: number,
    workDetailId?: string // Add optional work detail ID
  ): Promise<{ success: boolean; data?: PreAllocation; error?: string }> {
    try {
      // 1. Check if truck already has an allocation
      const existingAllocation = await this.checkExistingAllocation(
        truckNumber, 
        destination, 
        product
      );
      
      if (existingAllocation) {
        return {
          success: false,
          error: `Truck ${truckNumber} already has an active allocation for ${product} to ${destination}`
        };
      }

      // 2. Check permit availability and volume
      const volumeCheck = await checkEntryVolumes(this.db, permitEntryId);
      if (!volumeCheck.isValid || volumeCheck.remainingVolume < quantity) {
        return {
          success: false,
          error: `Insufficient volume. Available: ${volumeCheck.remainingVolume}, Requested: ${quantity}`
        };
      }

      // 3. Create allocation
      const allocationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const allocation: PreAllocation = {
        id: allocationId,
        permitEntryId,
        permitNumber,
        truckNumber,
        product,
        destination: destination.toLowerCase(),
        quantity,
        owner,
        allocatedAt: new Date().toISOString(),
        used: false,
        workDetailId, // Add reference to work detail
        timestamp: Date.now()
      };

      // 4. Update database atomically
      const updates: Record<string, any> = {
        [`permitPreAllocations/${allocationId}`]: allocation,
        [`allocations/${permitEntryId}/preAllocatedQuantity`]: volumeCheck.preAllocatedVolume + quantity
      };

      // Add work detail update if provided
      if (workDetailId) {
        updates[`work_details/${workDetailId}/permitAllocated`] = true;
        updates[`work_details/${workDetailId}/permitEntryId`] = permitEntryId;
        updates[`work_details/${workDetailId}/permitNumber`] = permitNumber;
      }

      await update(ref(this.db), updates);
      return { success: true, data: allocation };

    } catch (error) {
      console.error('Allocation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkExistingAllocation(
    truckNumber: string,
    destination: string,
    product: string
  ): Promise<PreAllocation | null> {
    const snapshot = await get(
      query(
        ref(this.db, 'permitPreAllocations'),
        orderByChild('truckNumber'),
        equalTo(truckNumber)
      )
    );

    if (!snapshot.exists()) return null;

    let found: PreAllocation | null = null;
    snapshot.forEach(child => {
      const allocation = child.val() as PreAllocation;
      if (!allocation.used &&
          allocation.destination?.toLowerCase() === destination.toLowerCase() &&
          allocation.product.toLowerCase() === product.toLowerCase()) {
        found = allocation;
      }
    });

    return found;
  }

  async releaseAllocation(allocationId: string): Promise<void> {
    const allocation = await this.getAllocation(allocationId);
    if (!allocation) return;

    const updates: Record<string, any> = {
      [`permitPreAllocations/${allocationId}`]: null,
    };

    // Reset work detail if exists
    const workDetail = await this.findWorkDetail(
      allocation.truckNumber,
      allocation.destination,
      allocation.product
    );

    if (workDetail?.key) {
      updates[`work_details/${workDetail.key}/permitAllocated`] = false;
      updates[`work_details/${workDetail.key}/permitNumbers`] = null;
      updates[`work_details/${workDetail.key}/permitEntryIds`] = null;
    }

    await update(ref(this.db), updates);
  }

  private async getAllocation(id: string): Promise<PreAllocation | null> {
    const snapshot = await get(ref(this.db, `permitPreAllocations/${id}`));
    return snapshot.exists() ? snapshot.val() : null;
  }

  private async findWorkDetail(
    truckNumber: string, 
    destination: string, 
    product: string
  ): Promise<WorkDetailWithKey | null> {
    const snapshot = await get(
      query(
        ref(this.db, 'work_details'),
        orderByChild('truck_number'),
        equalTo(truckNumber)
      )
    );

    if (!snapshot.exists()) return null;

    let result: WorkDetailWithKey | null = null;
    snapshot.forEach(child => {
      const detail = child.val() as WorkDetail;
      if (detail.destination?.toLowerCase() === destination.toLowerCase() &&
          detail.product?.toLowerCase() === product.toLowerCase()) {
        result = { 
          ...detail, 
          key: child.key as string 
        };
      }
    });

    return result;
  }
}
