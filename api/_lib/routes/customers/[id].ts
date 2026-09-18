import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../../db.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Client } from '../../models/Client.js';
import { PriceList, PriceListDoc } from '../../models/PriceList.js';
import { DealerProfile, DealerProfileDoc, BUSINESS_TYPES, DEALER_CATEGORIES, OWNER_ROLES, SIGNATORY_TYPES, PAYMENT_TYPES, CUSTOMER_SEGMENTS } from '../../models/DealerProfile.js';
import { Vehicle } from '../../models/Vehicle.js';
import { SalespersonAssignment } from '../../models/SalespersonAssignment.js';
import { CustomerInvoice } from '../../models/CustomerInvoice.js';
import { SalesOrder } from '../../models/SalesOrder.js';
import { Quotation } from '../../models/Quotation.js';
import { JobCard } from '../../models/JobCard.js';
import { Booking } from '../../models/Booking.js';
import { DeliveryNote } from '../../models/DeliveryNote.js';
import { Receipt } from '../../models/Receipt.js';
import { AdvancePayment } from '../../models/AdvancePayment.js';
import { Cheque } from '../../models/Cheque.js';
import { WarrantyClaim } from '../../models/WarrantyClaim.js';
import { Complaint } from '../../models/Complaint.js';
import { CollectionRecord } from '../../models/CollectionRecord.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomer, serializeDealerProfile } from '../../serializers.js';
import { hasAddOn } from '../../entitlements.js';
import { generateSequentialNumber } from '../../numbering.js';
import { CREDIT_ELIGIBLE_CUSTOMER_TYPES } from '../../creditDiscipline.js';

// Delete guard — real financial/transactional history a hard delete would
// silently orphan or make unreconcilable. Deliberately does NOT include
// lighter CRM-engagement records (Followup, SalesVisit, Reminder, CallLog,
// Feedback, SmsLog, LoyaltyTransaction, CollectionTask, Prospect) — those
// are left as-is (a small, accepted orphaning) rather than blocking a
// customer delete over engagement history with no financial consequence.
// CreditNote is deliberately excluded — it has no customerId field at all
// (see CreditNote.ts's own comment), so it can't be checked here anyway.
const CUSTOMER_HISTORY_MODELS = [
  { model: CustomerInvoice, label: 'invoices' },
  { model: SalesOrder, label: 'sales orders' },
  { model: Quotation, label: 'quotations' },
  { model: JobCard, label: 'job cards' },
  { model: Booking, label: 'bookings' },
  { model: DeliveryNote, label: 'delivery notes' },
  { model: Receipt, label: 'receipts' },
  { model: AdvancePayment, label: 'advance payments' },
  { model: Cheque, label: 'cheques' },
  { model: WarrantyClaim, label: 'warranty claims' },
  { model: Complaint, label: 'complaints' },
  { model: CollectionRecord, label: 'collection records' },
] as const;

type CustomerType = 'individual' | 'corporate' | 'retail' | 'wholesale' | 'dealer';

interface DealerProfileBody {
  legalBusinessName?: string;
  tradingName?: string;
  businessRegistrationNo?: string;
  businessType?: (typeof BUSINESS_TYPES)[number];
  yearEstablished?: number;
  dealerCategory?: (typeof DEALER_CATEGORIES)[number];
  mainContact?: { person?: string; designation?: string; mobile?: string; landline?: string; email?: string; whatsapp?: string; website?: string };
  accountsContact?: { name?: string; phone?: string; email?: string };
  purchasingContact?: { name?: string; phone?: string; email?: string };
  registeredAddress?: { line1?: string; line2?: string; city?: string; district?: string; province?: string; postalCode?: string };
  businessAddress?: { sameAsRegistered?: boolean; line1?: string; city?: string; district?: string };
  billingAddress?: { sameAsBusiness?: boolean; address?: string };
  deliveryAddress?: { sameAsBusiness?: boolean; address?: string };
  tin?: string;
  vatRegistered?: boolean;
  vatNumber?: string;
  svatNumber?: string;
  taxType?: string;
  taxExemptionStatus?: string;
  owners?: { name: string; nicOrPassport?: string; designation?: string; mobile?: string; email?: string; address?: string; role?: (typeof OWNER_ROLES)[number] }[];
  signatories?: { name: string; designation?: string; nic?: string; mobile?: string; signatureUrl?: string; signatureType?: (typeof SIGNATORY_TYPES)[number]; active?: boolean }[];
  region?: string;
  branchId?: string;
  dealerClass?: string;
  dealerGroup?: string;
  paymentType?: (typeof PAYMENT_TYPES)[number];
  dealerBankAccounts?: { bankName: string; branch?: string; accountName?: string; accountNumber?: string; accountType?: string; bankCode?: string }[];
  businessProfile?: {
    numberOutlets?: number; numberEmployees?: number; numberSalesStaff?: number; numberVehicles?: number;
    approxMonthlyPurchase?: number; approxAnnualPurchase?: number;
    brandsSelling?: string[]; competitorBrands?: string[]; mainTyreSizes?: string[];
    customerSegment?: (typeof CUSTOMER_SEGMENTS)[number];
  };
}

interface UpdateCustomerBody {
  name?: string;
  phone?: string;
  tags?: string[];
  type?: CustomerType;
  contactPerson?: string;
  creditLimit?: number;
  discountPct?: number;
  creditPeriodDays?: number;
  billingAddress?: string;
  shippingAddress?: string;
  taxNumber?: string;
  status?: 'Active' | 'Inactive' | 'Blocked';
  defaultPriceListId?: string | null;
  // Customer/Dealer Registration roadmap Phase 1 — upgrades an existing
  // Customer to a Dealer (creating its DealerProfile if none exists yet) or
  // edits an existing dealer's profile fields. Never downgrades/deletes an
  // existing DealerProfile — same append-only, don't-destroy-history
  // discipline as every other document in this codebase.
  registrationType?: 'customer' | 'dealer';
  dealerProfile?: DealerProfileBody;
}

function wantsCorporateFields(body: UpdateCustomerBody): boolean {
  return (
    (!!body.type && CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(body.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])) ||
    Number(body.creditLimit) > 0 ||
    Number(body.discountPct) > 0 ||
    body.creditPeriodDays !== undefined
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'DELETE') return handleDelete(req, res);
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireTenantPermission(req, res, 'customers:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  await connectToDatabase();

  const existing = (await Customer.findOne({ _id: id, clientId: session.clientId }).lean()) as CustomerDoc | null;
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const body = (req.body ?? {}) as UpdateCustomerBody;

  // Customer/Dealer Registration roadmap Phase 1 — upgrading to 'dealer'
  // forces type: 'dealer' too, same reasoning as create; wantsCorporateFields
  // needs to see that effective type to trigger the existing gms-fleet gate.
  const isUpgradingToDealer = body.registrationType === 'dealer';
  if (wantsCorporateFields({ ...body, type: isUpgradingToDealer ? 'dealer' : body.type }) && !(await hasAddOn(session.clientId, 'gms-fleet'))) {
    return res.status(400).json({ error: 'Corporate accounts require the Fleet Management add-on' });
  }

  const update: Record<string, unknown> = {};
  for (const key of ['name', 'phone', 'tags', 'type', 'contactPerson', 'billingAddress', 'shippingAddress', 'taxNumber', 'status'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (isUpgradingToDealer) {
    update.type = 'dealer';
    update.registrationType = 'dealer';
  }
  if (body.creditLimit !== undefined) update.creditLimit = Number(body.creditLimit) || 0;
  if (body.discountPct !== undefined) update.discountPct = Math.min(100, Math.max(0, Number(body.discountPct) || 0));
  if (body.creditPeriodDays !== undefined) update.creditPeriodDays = Math.max(1, Number(body.creditPeriodDays) || 30);

  let priceListName: string | undefined;
  let unassignPriceList = false;
  if (body.defaultPriceListId !== undefined) {
    if (!body.defaultPriceListId) {
      // Unassigning is always allowed, no gate needed to remove one. Plain
      // `undefined` in a non-$set-wrapped update object gets silently
      // dropped by Mongoose rather than clearing the field, so this needs a
      // real $unset.
      unassignPriceList = true;
    } else {
      const client = await Client.findById(session.clientId).select('priceListsEnabled').lean();
      if (!client?.priceListsEnabled) {
        return res.status(400).json({ error: 'Price Lists must be enabled in Settings before assigning one to a customer' });
      }
      const priceList = (await PriceList.findOne({ _id: body.defaultPriceListId, clientId: session.clientId }).lean()) as PriceListDoc | null;
      if (!priceList) return res.status(400).json({ error: 'Unknown price list' });
      update.defaultPriceListId = body.defaultPriceListId;
      priceListName = priceList.name;
    }
  }

  const customer = (await Customer.findOneAndUpdate(
    { _id: id, clientId: session.clientId },
    unassignPriceList ? { $set: update, $unset: { defaultPriceListId: '' } } : update,
    { returnDocument: 'after' }
  ).lean()) as CustomerDoc;

  // Customer/Dealer Registration roadmap Phase 1 — create-or-update the
  // linked DealerProfile whenever this customer is (or is becoming) a
  // dealer. Never downgrades/deletes an existing profile if registrationType
  // isn't 'dealer' in this request — same append-only discipline as
  // everywhere else in this codebase.
  let dealerProfileResult: DealerProfileDoc | undefined;
  const effectiveRegistrationType = isUpgradingToDealer ? 'dealer' : existing.registrationType ?? 'customer';
  if (effectiveRegistrationType === 'dealer') {
    const existingProfile = (await DealerProfile.findOne({ clientId: session.clientId, customerId: id }).lean()) as DealerProfileDoc | null;
    if (!existingProfile) {
      const dealerCode = await generateSequentialNumber(DealerProfile, session.clientId, 'dealerCode', 'dealerCode');
      const created = await DealerProfile.create({
        clientId: session.clientId,
        customerId: id,
        dealerCode,
        legalBusinessName: body.dealerProfile?.legalBusinessName,
        tradingName: body.dealerProfile?.tradingName,
        businessRegistrationNo: body.dealerProfile?.businessRegistrationNo,
        businessType: body.dealerProfile?.businessType,
        yearEstablished: body.dealerProfile?.yearEstablished,
        dealerCategory: body.dealerProfile?.dealerCategory,
        mainContact: body.dealerProfile?.mainContact ?? {},
        accountsContact: body.dealerProfile?.accountsContact ?? {},
        purchasingContact: body.dealerProfile?.purchasingContact ?? {},
        registeredAddress: body.dealerProfile?.registeredAddress ?? {},
        businessAddress: body.dealerProfile?.businessAddress ?? {},
        billingAddress: body.dealerProfile?.billingAddress ?? {},
        deliveryAddress: body.dealerProfile?.deliveryAddress ?? {},
        tin: body.dealerProfile?.tin,
        vatRegistered: body.dealerProfile?.vatRegistered ?? false,
        vatNumber: body.dealerProfile?.vatNumber,
        svatNumber: body.dealerProfile?.svatNumber,
        taxType: body.dealerProfile?.taxType,
        taxExemptionStatus: body.dealerProfile?.taxExemptionStatus,
        owners: body.dealerProfile?.owners ?? [],
        signatories: body.dealerProfile?.signatories ?? [],
        region: body.dealerProfile?.region,
        branchId: body.dealerProfile?.branchId || undefined,
        dealerClass: body.dealerProfile?.dealerClass,
        dealerGroup: body.dealerProfile?.dealerGroup,
        paymentType: body.dealerProfile?.paymentType,
        dealerBankAccounts: body.dealerProfile?.dealerBankAccounts ?? [],
        businessProfile: body.dealerProfile?.businessProfile ?? {},
        status: 'New Dealer',
      });
      dealerProfileResult = created.toObject() as DealerProfileDoc;
    } else if (body.dealerProfile) {
      const profileUpdate: Record<string, unknown> = {};
      for (const key of [
        'legalBusinessName', 'tradingName', 'businessRegistrationNo', 'businessType', 'yearEstablished', 'dealerCategory',
        'mainContact', 'accountsContact', 'purchasingContact', 'registeredAddress', 'businessAddress', 'billingAddress',
        'deliveryAddress', 'tin', 'vatRegistered', 'vatNumber', 'svatNumber', 'taxType', 'taxExemptionStatus',
        'owners', 'signatories', 'region', 'branchId', 'dealerClass', 'dealerGroup', 'paymentType', 'dealerBankAccounts', 'businessProfile',
      ] as const) {
        if (body.dealerProfile[key] !== undefined) profileUpdate[key] = body.dealerProfile[key];
      }
      dealerProfileResult = (await DealerProfile.findOneAndUpdate(
        { _id: existingProfile._id, clientId: session.clientId },
        profileUpdate,
        { returnDocument: 'after' }
      ).lean()) as DealerProfileDoc;
    } else {
      dealerProfileResult = existingProfile;
    }
  }

  return res.status(200).json({
    customer: serializeCustomer(customer, priceListName, dealerProfileResult ? serializeDealerProfile(dealerProfileResult) : undefined),
  });
}

async function handleDelete(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customers:manage');
  if (!session) return;

  const { id } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'Missing customer id' });

  await connectToDatabase();

  const existing = await Customer.findOne({ _id: id, clientId: session.clientId }).lean();
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const hits = await Promise.all(
    CUSTOMER_HISTORY_MODELS.map(async ({ model, label }) => ((await model.exists({ clientId: session.clientId, customerId: id })) ? label : null))
  );
  const blockingLabels = hits.filter((label) => label !== null) as string[];
  if (blockingLabels.length > 0) {
    return res.status(400).json({ error: `This customer has existing ${blockingLabels.join(', ')} and cannot be deleted` });
  }

  // Cascade-delete the customer's own lightweight linked records — none of
  // these can exist independently of the Customer they belong to, and none
  // are referenced by anything outside the history models already checked
  // above (which we just confirmed are absent).
  await Promise.all([
    DealerProfile.deleteOne({ clientId: session.clientId, customerId: id }),
    Vehicle.deleteMany({ clientId: session.clientId, customerId: id }),
    SalespersonAssignment.deleteMany({ clientId: session.clientId, customerId: id }),
  ]);
  await Customer.deleteOne({ _id: id, clientId: session.clientId });

  return res.status(200).json({ success: true });
}
