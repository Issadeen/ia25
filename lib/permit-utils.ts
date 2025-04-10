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
  destination: string,
  product: string
) => {
  try {
    const permitRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(permitRef);
    
    if (!snapshot.exists()) return null;

    const now = new Date();
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(now.getDate() - 3);
    
    let validPermit = null;
    snapshot.forEach((child) => {
      const permit = child.val();
      const permitDate = new Date(permit.allocatedAt);
      
      if (permit.truckNumber === truckNumber && 
          !permit.used &&
          permitDate > threeDaysAgo &&
          permit.destination?.toLowerCase() === destination.toLowerCase() &&
          permit.product.toLowerCase() === product.toLowerCase()) {
        validPermit = {
          ...permit,
          id: child.key
        };
      }
    });
    
    return validPermit;
  } catch (error) {
    console.error('Error getting pre-allocated permit:', error);
    return null;
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
