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
  amountPaid?: number;
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  gatePassGenerated?: boolean;
  gatePassGeneratedAt?: string;
}

export interface TruckPayment {
  amount: number;
  timestamp: string;
  note?: string;
  paymentId?: string;
  truckId?: string;
}

export interface OwnerBalance {
  amount: number;
  lastUpdated: string;
}

export interface BalanceUsage {
  amount: number;
  timestamp: string;
  usedFor: string[];
  paymentId: string;
  type?: 'deposit' | 'usage' | 'manual_adjustment' | 'reconciliation_adjustment';
  note?: string;
}

export interface BalanceReconciliation {
  id: string;
  ourBalance: number;
  theirBalance: number;
  difference: number;
  timestamp: string;
  status: 'pending' | 'accepted' | 'rejected';
  note?: string;
  createdBy: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface Payment {
  id: string;
  amountPaid: number;
  timestamp: string;
  allocatedTo?: string[];
  note?: string;
  allocatedTrucks?: {
    truckId: string;
    amount: number;
  }[];
}

export interface PaymentFormData {
  amount: number;
  note: string;
  allocatedTrucks: {
    truckId: string;
    amount: number;
  }[];
  useExistingBalance: boolean;
  balanceToUse: number;
}

// Add other shared interfaces here
