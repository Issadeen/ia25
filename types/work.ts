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
