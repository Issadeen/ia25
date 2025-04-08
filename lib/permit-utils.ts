import { Database, get, ref, set, push, update } from 'firebase/database';

interface PermitPreAllocation {
  id: string;
  truckNumber: string;
  product: string;
  permitEntryId: string;
  permitNumber: string;
  allocatedAt: string;
  usedAt?: string;
  used?: boolean;
  owner: string;
  destination: string; // Add destination field
}

export const preAllocatePermitEntry = async (
  db: Database,
  truckNumber: string,
  product: string,
  owner: string,
  permitEntryId: string,
  permitNumber: string,
  destination: string = 'ssd' // Add destination parameter with default
) => {
  try {
    const preAllocationRef = push(ref(db, 'permitPreAllocations'));
    const preAllocation: PermitPreAllocation = {
      id: preAllocationRef.key!,
      truckNumber,
      product,
      permitEntryId,
      permitNumber,
      allocatedAt: new Date().toISOString(),
      owner,
      destination
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
  truckNumber: string,
  destination?: string // Add optional destination parameter
): Promise<PermitPreAllocation | null> => {
  try {
    const preAllocationsRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(preAllocationsRef);

    if (!snapshot.exists()) return null;

    let preAllocation: PermitPreAllocation | null = null;
    snapshot.forEach((child) => {
      const data = child.val() as PermitPreAllocation;
      // If destination is specified, match both truck and destination
      // Otherwise just match the truck (backward compatibility)
      if ((data.truckNumber === truckNumber) && 
          (!data.used) && 
          (!destination || data.destination === destination)) {
        preAllocation = {
          ...data,
          id: child.key!
        };
        return true; // Exit the loop
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
