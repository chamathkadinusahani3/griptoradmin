import { Client } from './models/Client';

/**
 * First real server-side add-on enforcement in the app — every other add-on
 * so far only gates frontend UI (e.g. `crm-loyalty` in Customers.tsx). Used
 * to require the `gms-fleet` add-on before a tenant can set corporate-only
 * Customer fields (type: 'corporate', creditLimit, discountPct).
 */
export async function hasAddOn(clientId: string, addOnId: string): Promise<boolean> {
  const client = await Client.findById(clientId).select('addOns').lean();
  return !!client && (client as { addOns: string[] }).addOns.includes(addOnId);
}
