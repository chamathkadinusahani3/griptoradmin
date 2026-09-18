import type { VercelRequest, VercelResponse } from '@vercel/node';
import mongoose from 'mongoose';
import { connectToDatabase } from '../../db.js';
import { Customer, CustomerDoc } from '../../models/Customer.js';
import { Vehicle, VehicleDoc } from '../../models/Vehicle.js';
import { Client } from '../../models/Client.js';
import { PriceList, PriceListDoc } from '../../models/PriceList.js';
import { DealerProfile, DealerProfileDoc, BUSINESS_TYPES, DEALER_CATEGORIES, OWNER_ROLES, SIGNATORY_TYPES, PAYMENT_TYPES, CUSTOMER_SEGMENTS } from '../../models/DealerProfile.js';
import { requireTenantPermission } from '../../auth.js';
import { serializeCustomer, serializeDealerProfile } from '../../serializers.js';
import { hasAddOn } from '../../entitlements.js';
import { findModule } from '../../moduleCatalog.js';
import { generateSequentialNumber } from '../../numbering.js';
import { CREDIT_ELIGIBLE_CUSTOMER_TYPES } from '../../creditDiscipline.js';

type CustomerType = 'individual' | 'corporate' | 'retail' | 'wholesale' | 'dealer';
type RegistrationType = 'customer' | 'dealer';

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

interface CreateCustomerBody {
  name?: string;
  email?: string;
  phone?: string;
  vehicles?: string[];
  tags?: string[];
  type?: CustomerType;
  contactPerson?: string;
  creditLimit?: number;
  discountPct?: number;
  creditPeriodDays?: number;
  billingAddress?: string;
  shippingAddress?: string;
  taxNumber?: string;
  defaultPriceListId?: string;
  sourceModule?: string;
  // Customer/Dealer Registration roadmap Phase 1.
  registrationType?: RegistrationType;
  dealerProfile?: DealerProfileBody;
}

/** True if this body is trying to use a corporate-only field. */
function wantsCorporateFields(body: CreateCustomerBody): boolean {
  return (
    (!!body.type && CREDIT_ELIGIBLE_CUSTOMER_TYPES.includes(body.type as (typeof CREDIT_ELIGIBLE_CUSTOMER_TYPES)[number])) ||
    Number(body.creditLimit) > 0 ||
    Number(body.discountPct) > 0 ||
    body.creditPeriodDays !== undefined
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customers:view');
  if (!session) return;

  await connectToDatabase();

  // ?phone= / ?plate= power the booking form's debounced autofill lookup —
  // deliberately reusing this endpoint instead of adding a new one, same
  // "extend the existing list endpoint with query filters" convention used
  // everywhere else in this codebase.
  const { phone, plate } = req.query;
  const filter: Record<string, unknown> = { clientId: session.clientId };
  if (typeof phone === 'string' && phone.trim()) {
    filter.phone = phone.trim();
  } else if (typeof plate === 'string' && plate.trim()) {
    const vehicles = (await Vehicle.find({
      clientId: session.clientId,
      plate: { $regex: `^${plate.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    })
      .select('customerId')
      .lean()) as VehicleDoc[];
    const customerIds = [...new Set(vehicles.map((v) => v.customerId.toString()))];
    if (customerIds.length === 0) return res.status(200).json({ customers: [] });
    filter._id = { $in: customerIds };
  }

  const customers = (await Customer.find(filter).sort({ createdAt: -1 }).lean()) as CustomerDoc[];
  const priceListIds = [...new Set(customers.map((c) => c.defaultPriceListId?.toString()).filter((v): v is string => !!v))];
  const priceLists = priceListIds.length > 0 ? ((await PriceList.find({ _id: { $in: priceListIds } }).select('name').lean()) as PriceListDoc[]) : [];
  const priceListNameById = new Map(priceLists.map((pl) => [pl._id.toString(), pl.name]));

  // Customer/Dealer Registration roadmap Phase 1 — batched join, same
  // "one extra query, not N+1" convention as the price-list lookup above.
  // DealerProfile only exists for registrationType: 'dealer' customers, a
  // small subset in practice.
  const dealerCustomerIds = customers.filter((c) => c.registrationType === 'dealer').map((c) => c._id.toString());
  const dealerProfiles =
    dealerCustomerIds.length > 0
      ? ((await DealerProfile.find({ clientId: session.clientId, customerId: { $in: dealerCustomerIds } }).lean()) as DealerProfileDoc[])
      : [];
  const dealerProfileByCustomerId = new Map(dealerProfiles.map((p) => [p.customerId.toString(), serializeDealerProfile(p)]));

  return res.status(200).json({
    customers: customers.map((c) =>
      serializeCustomer(
        c,
        c.defaultPriceListId ? priceListNameById.get(c.defaultPriceListId.toString()) : undefined,
        dealerProfileByCustomerId.get(c._id.toString())
      )
    ),
  });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const session = await requireTenantPermission(req, res, 'customers:manage');
  if (!session) return;

  const body = (req.body ?? {}) as CreateCustomerBody;
  const { name, email, phone, vehicles, tags, contactPerson, creditLimit, discountPct, creditPeriodDays, billingAddress, shippingAddress, taxNumber, defaultPriceListId, sourceModule, dealerProfile } = body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  if (sourceModule !== undefined && !findModule(sourceModule)) {
    return res.status(400).json({ error: 'Unknown sourceModule' });
  }

  // Customer/Dealer Registration roadmap Phase 1 — picking 'dealer' forces
  // Customer.type to 'dealer' too, reusing the value that already exists in
  // that enum rather than a second parallel classification. This means the
  // existing gms-fleet gate below applies automatically — no new gating
  // rule, just the existing one now also triggered by registrationType.
  const isDealer = body.registrationType === 'dealer';
  const type: CustomerType = isDealer ? 'dealer' : body.type ?? 'individual';

  await connectToDatabase();

  if (wantsCorporateFields({ ...body, type }) && !(await hasAddOn(session.clientId, 'gms-fleet'))) {
    return res.status(400).json({ error: 'Corporate accounts require the Fleet Management add-on' });
  }

  let priceListName: string | undefined;
  if (defaultPriceListId) {
    const client = await Client.findById(session.clientId).select('priceListsEnabled').lean();
    if (!client?.priceListsEnabled) {
      return res.status(400).json({ error: 'Price Lists must be enabled in Settings before assigning one to a customer' });
    }
    const priceList = (await PriceList.findOne({ _id: defaultPriceListId, clientId: session.clientId }).lean()) as PriceListDoc | null;
    if (!priceList) return res.status(400).json({ error: 'Unknown price list' });
    priceListName = priceList.name;
  }

  const dbSession = await mongoose.startSession();
  try {
    let createdCustomer: CustomerDoc | undefined;
    let createdProfile: DealerProfileDoc | undefined;
    await dbSession.withTransaction(async () => {
      const [customerDoc] = await Customer.create(
        [
          {
            clientId: session.clientId,
            name,
            email: email.toLowerCase().trim(),
            phone,
            vehicles: vehicles ?? [],
            tags: tags ?? [],
            type,
            registrationType: isDealer ? 'dealer' : 'customer',
            contactPerson,
            creditLimit: Number(creditLimit) || 0,
            discountPct: Number(discountPct) || 0,
            creditPeriodDays: creditPeriodDays !== undefined ? Math.max(1, Number(creditPeriodDays) || 30) : 30,
            billingAddress,
            shippingAddress,
            taxNumber,
            defaultPriceListId: defaultPriceListId || undefined,
            sourceModule,
          },
        ],
        { session: dbSession }
      );
      createdCustomer = customerDoc.toObject() as CustomerDoc;

      if (isDealer) {
        const dealerCode = await generateSequentialNumber(DealerProfile, session.clientId, 'dealerCode', 'dealerCode');
        const [profileDoc] = await DealerProfile.create(
          [
            {
              clientId: session.clientId,
              customerId: customerDoc._id,
              dealerCode,
              legalBusinessName: dealerProfile?.legalBusinessName,
              tradingName: dealerProfile?.tradingName,
              businessRegistrationNo: dealerProfile?.businessRegistrationNo,
              businessType: dealerProfile?.businessType,
              yearEstablished: dealerProfile?.yearEstablished,
              dealerCategory: dealerProfile?.dealerCategory,
              mainContact: dealerProfile?.mainContact ?? {},
              accountsContact: dealerProfile?.accountsContact ?? {},
              purchasingContact: dealerProfile?.purchasingContact ?? {},
              registeredAddress: dealerProfile?.registeredAddress ?? {},
              businessAddress: dealerProfile?.businessAddress ?? {},
              billingAddress: dealerProfile?.billingAddress ?? {},
              deliveryAddress: dealerProfile?.deliveryAddress ?? {},
              tin: dealerProfile?.tin,
              vatRegistered: dealerProfile?.vatRegistered ?? false,
              vatNumber: dealerProfile?.vatNumber,
              svatNumber: dealerProfile?.svatNumber,
              taxType: dealerProfile?.taxType,
              taxExemptionStatus: dealerProfile?.taxExemptionStatus,
              owners: dealerProfile?.owners ?? [],
              signatories: dealerProfile?.signatories ?? [],
              region: dealerProfile?.region,
              branchId: dealerProfile?.branchId || undefined,
              dealerClass: dealerProfile?.dealerClass,
              dealerGroup: dealerProfile?.dealerGroup,
              paymentType: dealerProfile?.paymentType,
              dealerBankAccounts: dealerProfile?.dealerBankAccounts ?? [],
              businessProfile: dealerProfile?.businessProfile ?? {},
              // Phase 4 — every genuinely NEW DealerProfile starts the
              // credit-approval workflow explicitly; a profile that already
              // existed before Phase 4 shipped never gets this field
              // backfilled (see DEALER_APPROVAL_STATUSES's own comment).
              status: 'New Dealer',
            },
          ],
          { session: dbSession }
        );
        createdProfile = profileDoc.toObject() as DealerProfileDoc;
      }
    });

    return res.status(201).json({
      customer: serializeCustomer(createdCustomer!, priceListName, createdProfile ? serializeDealerProfile(createdProfile) : undefined),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create customer';
    return res.status(500).json({ error: message });
  } finally {
    await dbSession.endSession();
  }
}
