export interface Entry {
  key: string;
  motherEntry: string;
  initialQuantity: number;
  remainingQuantity: number;
  truckNumber?: string;
  destination: string;
  subtractedQuantity: number;
  status?: string;
  number: string;
  product: string;
  product_destination: string;
  timestamp: number;
  permitNumber?: string;
}
