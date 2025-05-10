export interface PermitEntry {
  preAllocatedQuantity: number;  // Total volume pre-allocated
  used: any;
  id: string;
  number: string;
  product: string;
  destination: string;
  product_destination: string;
  remainingQuantity: number;     // Current available volume
  initialQuantity: number;       // Original permit volume
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
  id: string;
  permitEntryId: string;
  permitNumber: string;
  truckNumber: string;
  product: string;
  destination: string;
  quantity: number;
  owner: string;
  allocatedAt: string;
  used: boolean;
  usedAt?: string;
  timestamp?: number;  // Add optional timestamp
  previousTruckNumber?: string;  // Add optional truck change tracking
  actualTruckNumber?: string;    // Add optional truck change tracking
  workDetailId?: string;         // Add optional reference to work detail
}
