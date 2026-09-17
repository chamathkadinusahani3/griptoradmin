export interface PriceListOverride {
  partId: string;
  partName?: string;
  price: number;
}

export interface PriceList {
  id: string;
  name: string;
  overrides: PriceListOverride[];
}
