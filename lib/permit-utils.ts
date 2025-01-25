import { Database, get, ref, set, push, update } from 'firebase/database';

interface PermitPreAllocation {
  id: string;
  truckNumber: string;
  product: string;
  permitEntryId: string;
  permitEntryNumber: string;
  allocatedAt: string;
  usedAt?: string;
  used?: boolean;
  owner: string;
}

export const preAllocatePermitEntry = async (
  db: Database,
  truckNumber: string,
  product: string,
  owner: string,
  permitEntryId: string,
  permitEntryNumber: string
) => {
  try {
    const preAllocationRef = push(ref(db, 'permitPreAllocations'));
    const preAllocation: PermitPreAllocation = {
      id: preAllocationRef.key!,
      truckNumber,
      product,
      permitEntryId,
      permitEntryNumber,
      allocatedAt: new Date().toISOString(),
      owner
    };

    await set(preAllocationRef, preAllocation);
    return preAllocation;
  } catch (error) {
    console.error('Error pre-allocating permit entry:', error);
    throw error;
  }
};

export const getPreAllocatedPermit = async (
  db: Database,
  truckNumber: string
): Promise<PermitPreAllocation | null> => {
  try {
    const preAllocationsRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(preAllocationsRef);

    if (!snapshot.exists()) return null;

    let preAllocation: PermitPreAllocation | null = null;
    snapshot.forEach((child) => {
      const data = child.val() as PermitPreAllocation;
      if (data.truckNumber === truckNumber && !data.used) {
        preAllocation = data;
      }
    });

    return preAllocation;
  } catch (error) {
    console.error('Error getting pre-allocated permit:', error);
    throw error;
  }
};

export const markPermitAsUsed = async (
  db: Database,
  preAllocationId: string
) => {
  try {
    await update(ref(db, `permitPreAllocations/${preAllocationId}`), {
      used: true,
      usedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error marking permit as used:', error);
    throw error;
  }
};
