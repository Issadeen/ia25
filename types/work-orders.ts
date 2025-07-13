export interface WorkOrder {
  id?: string;
  number: string;
  initialQuantity: number;
  remainingQuantity: number;
  product: string;
  destination: string;
  product_destination: string;
  timestamp: number;
  createdBy: string;
  truck?: string;
  depot?: string;
  lastModifiedAt?: string;
  lastModifiedBy?: string;
}

export interface WorkOrderAllocation {
  id?: string;
  orderId: string;
  orderNumber: string;
  quantity: number;
  product: string;
  destination: string;
  timestamp: number;
  createdBy: string;
  truck?: string;
  depot?: string;
}
