export interface PermitAllocation {
  id: string;
  truckNumber: string;
  product: string;
  owner: string;
  permitEntryId: string;
  permitNumber: string;
  allocatedAt: string;
  usedAt?: string;
  used?: boolean;
}

export interface PermitEntry {
  id: string;
  product: string;
  destination: string;
  remainingQuantity: number;
  timestamp: number;
  number: string;
  allocated?: boolean;
  allocatedTo?: {
    truck: string;
    product: string;
    owner: string;
    timestamp: string;
  };
}
