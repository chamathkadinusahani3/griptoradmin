export type PromotionDiscountType = 'percent' | 'amount';

export interface Promotion {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  /** Empty = applies to every part. */
  partIds: string[];
  /** Empty = applies to every customer type (and to POS, which has no customer identity at all). */
  customerTypes: string[];
  /** Empty = applies to every branch. */
  branchIds: string[];
  /** 0 = no minimum quantity. */
  minQty: number;
  /** 0 = no minimum order value. */
  minOrderValue: number;
  active: boolean;
}
