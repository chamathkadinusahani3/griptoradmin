import { Client } from './models/Client.js';
import { Customer } from './models/Customer.js';
import { PriceList, PriceListDoc } from './models/PriceList.js';

export interface PriceResolver {
  /** The effective price for this part — the customer's price-list override if one exists, otherwise `fallbackPrice` unchanged. */
  resolve(partId: string, fallbackPrice: number): number;
}

const PASSTHROUGH: PriceResolver = { resolve: (_partId, fallbackPrice) => fallbackPrice };

/**
 * Resolves a customer's assigned PriceList once per request (at most 3
 * lookups total: Client, Customer, PriceList) rather than per-line, then
 * returns a plain in-memory resolver for the create route to call per line.
 * Always the safe passthrough (identical to today's behavior) unless the
 * tenant has priceListsEnabled AND this specific customer has a
 * defaultPriceListId AND that list still exists.
 */
export async function getPriceResolverForCustomer(clientId: string, customerId: string | undefined): Promise<PriceResolver> {
  if (!customerId) return PASSTHROUGH;

  const client = await Client.findById(clientId).select('priceListsEnabled').lean();
  if (!client?.priceListsEnabled) return PASSTHROUGH;

  const customer = await Customer.findOne({ _id: customerId, clientId }).select('defaultPriceListId').lean();
  if (!customer?.defaultPriceListId) return PASSTHROUGH;

  const priceList = (await PriceList.findOne({ _id: customer.defaultPriceListId, clientId }).lean()) as PriceListDoc | null;
  if (!priceList) return PASSTHROUGH;

  const overrideByPart = new Map(priceList.overrides.map((o) => [o.partId.toString(), o.price]));
  return { resolve: (partId, fallbackPrice) => overrideByPart.get(partId) ?? fallbackPrice };
}
