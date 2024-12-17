export interface StockItem {
  product: string;
  quantity: number;
}

export interface Stocks {
  ago: StockItem;
  pms: StockItem;
}
