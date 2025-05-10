export interface WorkDetail {
  id: string;
  owner: string;
  product: string;
  truck_number: string;
  quantity: string;
  status: string;
  orderno: string;
  depot: string;
  destination: string;
  loaded?: boolean;
  paid?: boolean;
  at20?: string;
  previous_trucks?: string[];
  price: string;
  createdAt?: string;
  released?: boolean;
  paymentPending?: boolean;
  gatePassGenerated?: boolean;
  gatePassGeneratedAt?: string;
  permitAllocated?: boolean;      // Track if permit is allocated
  permitNumber?: string;          // Store permit number
  permitEntryId?: string;         // Store permit entry ID
  permitDestination?: string;     // Store permit destination
  permitQuantity?: number;        // Store allocated quantity
}

export interface WorkFormData {
  owner: string;
  product: string;
  truck_number: string;
  quantity: string;
  status: string;
  orderno: string;
  depot: string;
  destination: string;
  price: string;
}

export interface AddWorkFormData {
  owner: string;
  truck_number: string;
  status: string;
  orderno: string;
  depot: string;
  destination: string;
  product: string;
  quantity: string;
  price: string;
}

export interface ProductEntry {
  product: string;
  quantity: string;
  price: string;
}

export interface MultiProductWorkFormData {
  owner: string;
  truck_number: string;
  status: string;
  orderno: string;
  depot: string;
  destination: string;
  products: ProductEntry[];
}

export interface SummaryStats {
  totalOrders: number;
  queuedOrders: number;
  unqueuedOrders: number;
  agoOrders: number;
  pmsOrders: number;
  loadedOrders: number;
  pendingOrders: number;
  pendingAgoOrders: number;
  pendingPmsOrders: number;
  unqueuedAgoOrders: number;
  unqueuedPmsOrders: number;
}

export interface OwnerSummary {
  [key: string]: {
    totalOrders: number;
    agoOrders: number;
    pmsOrders: number;
    queuedOrders: number;
    unqueuedOrders: number;
    loadedOrders: number;
    pendingOrders: number;
    products: { [key: string]: number };
    loadedTrucks: WorkDetail[];
    pendingTrucks: WorkDetail[];
  }
}
