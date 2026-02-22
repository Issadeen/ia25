export interface ThirdPartyOrder {
  id: string;
  truckNumber: string;
  product: 'AGO' | 'PMS';
  volume: number;
  loadingCompany: string;
  destination: string;
  status: 'not_queued' | 'queued' | 'loaded';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  notes?: string;
}

export interface ThirdPartyFormData {
  truckNumber: string;
  product: 'AGO' | 'PMS';
  volume: number;
  loadingCompany: string;
  destination: string;
  status: 'not_queued' | 'queued' | 'loaded';
  notes?: string;
}

export const THIRD_PARTY_STATUSES = {
  not_queued: { label: 'Not Queued', color: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' },
  queued: { label: 'Queued', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  loaded: { label: 'Loaded', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' },
} as const;
