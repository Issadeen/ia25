export interface PermitEntry {
  preAllocatedQuantity: number;
  used: any;
  id: string;
  number: string;
  product: string;
  destination: string;
  product_destination: string;
  remainingQuantity: number;
  initialQuantity: number;
  timestamp: number;
  createdBy: string;
}

export interface PermitAllocation {
  destination: any;
  actualTruckNumber: any;
  id: any;
  previousTruckNumber: any;
  permitEntryId: any;
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
  timestamp: any;
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
  destination: string; // Add destination field
}
