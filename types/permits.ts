export interface PermitEntry {
  id: string;
  number: string;
  product: string;
  destination: string;
  product_destination: string;
  remainingQuantity: number;
  initialQuantity: number;
  timestamp: number;
  createdBy: string;
  preAllocatedQuantity?: number;
  allocatedTo?: PermitAllocation[];
  availableQuantity?: number; // Add this property
}

export interface PermitAllocation {
  used: any;
  allocatedAt: string | number | Date;
  permitNumber: any;
  truckNumber: any;
  truck: string;
  product: string;
  owner: string;
  quantity: number;
  timestamp: string;
}

export interface PreAllocation {
  id: string;
  truckNumber: string;
  product: string;
  owner: string;
  permitEntryId: string;
  permitNumber: string;
  quantity: number;
  allocatedAt: string;
  usedAt?: string;
  used?: boolean;
}
