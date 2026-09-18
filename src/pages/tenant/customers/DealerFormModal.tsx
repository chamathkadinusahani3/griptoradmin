import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PlusIcon, TrashIcon, UploadIcon, FileTextIcon, ImageIcon } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Label } from '../../../components/ui/Input';
import { Toggle } from '../../../components/ui/Toggle';
import { Customer } from '../../../types/customer';
import {
  BUSINESS_TYPES, DEALER_CATEGORIES, OWNER_ROLES, SIGNATORY_TYPES, PAYMENT_TYPES, CUSTOMER_SEGMENTS, DEALER_DOCUMENT_TYPES,
  Owner, Signatory, DealerBankAccount, DealerDocument, DealerDocumentType,
} from '../../../types/dealerProfile';
import { DeliveryRoute } from '../../../types/route';
import { Branch } from '../../../types/branch';
import { SalespersonAssignment } from '../../../types/salespersonAssignment';
import { api, ApiError } from '../../../lib/api';
import { uploadSalesAttachment } from '../../../lib/salesAttachmentUpload';
import { useAuth, AuthUser } from '../../../context/AuthContext';

// Customer/Dealer Registration roadmap — step-wizard modeled on
// CreateBookingModal.tsx's own shape (this app's only existing multi-step
// form) since there is no tab/stepper UI component to reuse instead. Phase 1
// added the first 4 steps (Basic Info/Contacts/Addresses/Tax); Phase 2 added
// Owners/Directors, Signatories, Sales Assignment, and Commercial + Bank;
// Phase 3 adds Business Profile and Documents.
type Step = 'basic' | 'contacts' | 'addresses' | 'tax' | 'owners' | 'signatories' | 'assignment' | 'commercial' | 'business' | 'documents';
const STEPS: Step[] = ['basic', 'contacts', 'addresses', 'tax', 'owners', 'signatories', 'assignment', 'commercial', 'business', 'documents'];
const STEP_LABELS: Record<Step, string> = {
  basic: 'Basic Info',
  contacts: 'Contacts',
  addresses: 'Addresses',
  tax: 'Tax',
  owners: 'Owners / Directors',
  signatories: 'Signatories',
  assignment: 'Sales Assignment',
  commercial: 'Commercial + Bank',
  business: 'Business Profile',
  documents: 'Documents',
};

function toCsv(list: string[]): string {
  return list.join(', ');
}
function fromCsv(text: string): string[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  /** Set when editing an existing dealer instead of registering a new one. */
  editing?: Customer | null;
}

const emptyOwner = (): Owner => ({ name: '', nicOrPassport: '', designation: '', mobile: '', email: '', address: '', role: 'Owner' });
const emptySignatory = (): Signatory => ({ name: '', designation: '', nic: '', mobile: '', signatureType: 'Single', active: true });
const emptyBankAccount = (): DealerBankAccount => ({ bankName: '', branch: '', accountName: '', accountNumber: '', accountType: '', bankCode: '' });

function emptyForm() {
  return {
    // Base Customer fields — a dealer is still a Customer underneath.
    name: '',
    email: '',
    phone: '',
    // Basic Info (DealerProfile)
    legalBusinessName: '',
    tradingName: '',
    businessRegistrationNo: '',
    businessType: '' as (typeof BUSINESS_TYPES)[number] | '',
    yearEstablished: '',
    dealerCategory: '' as (typeof DEALER_CATEGORIES)[number] | '',
    // Contacts
    mainPerson: '', mainDesignation: '', mainMobile: '', mainLandline: '', mainEmail: '', mainWhatsapp: '', mainWebsite: '',
    accountsName: '', accountsPhone: '', accountsEmail: '',
    purchasingName: '', purchasingPhone: '', purchasingEmail: '',
    // Addresses
    regLine1: '', regLine2: '', regCity: '', regDistrict: '', regProvince: '', regPostalCode: '',
    businessSameAsRegistered: true, businessLine1: '', businessCity: '', businessDistrict: '',
    billingSameAsBusiness: true, billingAddress: '',
    deliverySameAsBusiness: true, deliveryAddress: '',
    // Tax
    tin: '', vatRegistered: false, vatNumber: '', svatNumber: '', taxType: '', taxExemptionStatus: '',
    // Sales assignment — salesRepId/territory/routeId live on
    // SalespersonAssignment (a separate document), not on DealerProfile.
    region: '', branchId: '', dealerClass: '', dealerGroup: '',
    salesRepId: '', territory: '', routeId: '',
    // Commercial — creditLimit/discountPct/creditPeriodDays live on
    // Customer (reused, not duplicated); paymentType is the one genuinely
    // new field, stored on DealerProfile.
    paymentType: '' as (typeof PAYMENT_TYPES)[number] | '',
    creditLimit: '', discountPct: '', creditPeriodDays: '',
    // Business Profile — brandsSelling/competitorBrands/mainTyreSizes are
    // comma-separated text in the UI, arrays on the wire (see toCsv/fromCsv).
    numberOutlets: '', numberEmployees: '', numberSalesStaff: '', numberVehicles: '',
    approxMonthlyPurchase: '', approxAnnualPurchase: '',
    brandsSelling: '', competitorBrands: '', mainTyreSizes: '',
    customerSegment: '' as (typeof CUSTOMER_SEGMENTS)[number] | '',
  };
}

export function DealerFormModal({ open, onClose, onCreated, editing }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('basic');
  const [form, setForm] = useState(emptyForm());
  const [owners, setOwners] = useState<Owner[]>([]);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<DealerBankAccount[]>([]);
  const [documents, setDocuments] = useState<DealerDocument[]>([]);
  const [uploadingType, setUploadingType] = useState<DealerDocumentType | null>(null);
  const [saving, setSaving] = useState(false);
  // Tenant staff logins to assign as this dealer's sales rep — picking one
  // resolves/auto-provisions the Employee -> Salesperson chain server-side
  // (api/_lib/salespersonUserLink.ts) so that specific login reliably sees
  // this dealer under "My Dealers", rather than requiring an admin to have
  // hand-created a matching Salesperson master-data record first.
  const [staffUsers, setStaffUsers] = useState<AuthUser[]>([]);
  const [routes, setRoutes] = useState<DeliveryRoute[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    if (!open) return;
    api.get<{ staff: AuthUser[] }>('/staff').then(({ staff }) => setStaffUsers(staff)).catch(() => setStaffUsers([]));
    api.get<{ routes: DeliveryRoute[] }>('/sf-routes').then(({ routes }) => setRoutes(routes)).catch(() => setRoutes([]));
    api.get<{ branches: Branch[] }>('/branches').then(({ branches }) => setBranches(branches)).catch(() => setBranches([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStep('basic');
    setOwners([]);
    setSignatories([]);
    setBankAccounts([]);
    setDocuments([]);
    if (editing?.dealerProfile) {
      const p = editing.dealerProfile;
      setForm({
        name: editing.name, email: editing.email, phone: editing.phone ?? '',
        legalBusinessName: p.legalBusinessName ?? '', tradingName: p.tradingName ?? '', businessRegistrationNo: p.businessRegistrationNo ?? '',
        businessType: p.businessType ?? '', yearEstablished: p.yearEstablished ? String(p.yearEstablished) : '', dealerCategory: p.dealerCategory ?? '',
        mainPerson: p.mainContact.person ?? '', mainDesignation: p.mainContact.designation ?? '', mainMobile: p.mainContact.mobile ?? '',
        mainLandline: p.mainContact.landline ?? '', mainEmail: p.mainContact.email ?? '', mainWhatsapp: p.mainContact.whatsapp ?? '', mainWebsite: p.mainContact.website ?? '',
        accountsName: p.accountsContact.name ?? '', accountsPhone: p.accountsContact.phone ?? '', accountsEmail: p.accountsContact.email ?? '',
        purchasingName: p.purchasingContact.name ?? '', purchasingPhone: p.purchasingContact.phone ?? '', purchasingEmail: p.purchasingContact.email ?? '',
        regLine1: p.registeredAddress.line1 ?? '', regLine2: p.registeredAddress.line2 ?? '', regCity: p.registeredAddress.city ?? '',
        regDistrict: p.registeredAddress.district ?? '', regProvince: p.registeredAddress.province ?? '', regPostalCode: p.registeredAddress.postalCode ?? '',
        businessSameAsRegistered: p.businessAddress.sameAsRegistered, businessLine1: p.businessAddress.line1 ?? '', businessCity: p.businessAddress.city ?? '', businessDistrict: p.businessAddress.district ?? '',
        billingSameAsBusiness: p.billingAddress.sameAsBusiness, billingAddress: p.billingAddress.address ?? '',
        deliverySameAsBusiness: p.deliveryAddress.sameAsBusiness, deliveryAddress: p.deliveryAddress.address ?? '',
        tin: p.tin ?? '', vatRegistered: p.vatRegistered, vatNumber: p.vatNumber ?? '', svatNumber: p.svatNumber ?? '', taxType: p.taxType ?? '', taxExemptionStatus: p.taxExemptionStatus ?? '',
        region: p.region ?? '', branchId: p.branchId ?? '', dealerClass: p.dealerClass ?? '', dealerGroup: p.dealerGroup ?? '',
        salesRepId: '', territory: '', routeId: '',
        paymentType: p.paymentType ?? '',
        creditLimit: editing.creditLimit ? String(editing.creditLimit) : '', discountPct: editing.discountPct ? String(editing.discountPct) : '', creditPeriodDays: editing.creditPeriodDays ? String(editing.creditPeriodDays) : '',
        numberOutlets: p.businessProfile.numberOutlets ? String(p.businessProfile.numberOutlets) : '',
        numberEmployees: p.businessProfile.numberEmployees ? String(p.businessProfile.numberEmployees) : '',
        numberSalesStaff: p.businessProfile.numberSalesStaff ? String(p.businessProfile.numberSalesStaff) : '',
        numberVehicles: p.businessProfile.numberVehicles ? String(p.businessProfile.numberVehicles) : '',
        approxMonthlyPurchase: p.businessProfile.approxMonthlyPurchase ? String(p.businessProfile.approxMonthlyPurchase) : '',
        approxAnnualPurchase: p.businessProfile.approxAnnualPurchase ? String(p.businessProfile.approxAnnualPurchase) : '',
        brandsSelling: toCsv(p.businessProfile.brandsSelling ?? []), competitorBrands: toCsv(p.businessProfile.competitorBrands ?? []), mainTyreSizes: toCsv(p.businessProfile.mainTyreSizes ?? []),
        customerSegment: p.businessProfile.customerSegment ?? '',
      });
      setOwners(p.owners.length > 0 ? p.owners : []);
      setSignatories(p.signatories.length > 0 ? p.signatories : []);
      setBankAccounts(p.dealerBankAccounts.length > 0 ? p.dealerBankAccounts : []);
      setDocuments(p.documents ?? []);
      api
        .get<{ assignments: SalespersonAssignment[] }>(`/salesperson-assignments?customerId=${editing.id}`)
        .then(({ assignments }) => {
          const active = assignments.find((a) => a.active) ?? assignments[0];
          const salesRepUserId = active?.salespersonUserId;
          // Only prefillable when this assignment's Salesperson actually
          // resolves to a real tenant login — one created purely as master
          // data (no linked Employee) has no corresponding option in this
          // dropdown at all.
          if (active && salesRepUserId) setForm((f) => ({ ...f, salesRepId: salesRepUserId, territory: active.territory ?? '', routeId: active.routeId ?? '' }));
        })
        .catch(() => undefined);
    } else {
      setForm(emptyForm());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const stepIndex = STEPS.indexOf(step);
  const goNext = () => setStep(STEPS[stepIndex + 1]);
  const goBack = () => setStep(STEPS[stepIndex - 1]);

  const canGoNext = step === 'basic' ? !!form.name.trim() && !!form.email.trim() : true;

  const updateOwner = (i: number, patch: Partial<Owner>) => setOwners((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const updateSignatory = (i: number, patch: Partial<Signatory>) => setSignatories((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const updateBankAccount = (i: number, patch: Partial<DealerBankAccount>) => setBankAccounts((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  // Documents can only be uploaded once the dealer already has a real
  // customerId (Vercel Blob needs somewhere to attach the result to) — same
  // chicken-and-egg constraint the simple customer form already has for its
  // own first-vehicle upload. During initial registration this step is
  // shown as a "come back after saving" notice instead.
  const uploadDocument = async (documentType: DealerDocumentType, file: File) => {
    if (!editing || !user?.clientId) return;
    setUploadingType(documentType);
    try {
      const uploaded = await uploadSalesAttachment(user.clientId, 'dealer-documents', file);
      const { dealerProfile } = await api.post<{ dealerProfile: { documents: DealerDocument[] } }>(`/customers/${editing.id}/dealer-documents`, { documentType, ...uploaded });
      setDocuments(dealerProfile.documents);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to upload ${file.name}`);
    } finally {
      setUploadingType(null);
    }
  };

  const removeDocument = async (documentType: DealerDocumentType) => {
    if (!editing) return;
    try {
      const { dealerProfile } = await api.delete<{ dealerProfile: { documents: DealerDocument[] } }>(`/customers/${editing.id}/dealer-documents?documentType=${encodeURIComponent(documentType)}`);
      setDocuments(dealerProfile.documents);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove document');
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    setSaving(true);
    const dealerProfile = {
      legalBusinessName: form.legalBusinessName || undefined,
      tradingName: form.tradingName || undefined,
      businessRegistrationNo: form.businessRegistrationNo || undefined,
      businessType: form.businessType || undefined,
      yearEstablished: form.yearEstablished ? Number(form.yearEstablished) : undefined,
      dealerCategory: form.dealerCategory || undefined,
      mainContact: {
        person: form.mainPerson || undefined, designation: form.mainDesignation || undefined, mobile: form.mainMobile || undefined,
        landline: form.mainLandline || undefined, email: form.mainEmail || undefined, whatsapp: form.mainWhatsapp || undefined, website: form.mainWebsite || undefined,
      },
      accountsContact: { name: form.accountsName || undefined, phone: form.accountsPhone || undefined, email: form.accountsEmail || undefined },
      purchasingContact: { name: form.purchasingName || undefined, phone: form.purchasingPhone || undefined, email: form.purchasingEmail || undefined },
      registeredAddress: {
        line1: form.regLine1 || undefined, line2: form.regLine2 || undefined, city: form.regCity || undefined,
        district: form.regDistrict || undefined, province: form.regProvince || undefined, postalCode: form.regPostalCode || undefined,
      },
      businessAddress: { sameAsRegistered: form.businessSameAsRegistered, line1: form.businessLine1 || undefined, city: form.businessCity || undefined, district: form.businessDistrict || undefined },
      billingAddress: { sameAsBusiness: form.billingSameAsBusiness, address: form.billingAddress || undefined },
      deliveryAddress: { sameAsBusiness: form.deliverySameAsBusiness, address: form.deliveryAddress || undefined },
      tin: form.tin || undefined,
      vatRegistered: form.vatRegistered,
      vatNumber: form.vatNumber || undefined,
      svatNumber: form.svatNumber || undefined,
      taxType: form.taxType || undefined,
      taxExemptionStatus: form.taxExemptionStatus || undefined,
      owners: owners.filter((o) => o.name.trim()),
      signatories: signatories.filter((s) => s.name.trim()),
      region: form.region || undefined,
      branchId: form.branchId || undefined,
      dealerClass: form.dealerClass || undefined,
      dealerGroup: form.dealerGroup || undefined,
      paymentType: form.paymentType || undefined,
      dealerBankAccounts: bankAccounts.filter((b) => b.bankName.trim()),
      businessProfile: {
        numberOutlets: form.numberOutlets ? Number(form.numberOutlets) : undefined,
        numberEmployees: form.numberEmployees ? Number(form.numberEmployees) : undefined,
        numberSalesStaff: form.numberSalesStaff ? Number(form.numberSalesStaff) : undefined,
        numberVehicles: form.numberVehicles ? Number(form.numberVehicles) : undefined,
        approxMonthlyPurchase: form.approxMonthlyPurchase ? Number(form.approxMonthlyPurchase) : undefined,
        approxAnnualPurchase: form.approxAnnualPurchase ? Number(form.approxAnnualPurchase) : undefined,
        brandsSelling: fromCsv(form.brandsSelling),
        competitorBrands: fromCsv(form.competitorBrands),
        mainTyreSizes: fromCsv(form.mainTyreSizes),
        customerSegment: form.customerSegment || undefined,
      },
    };
    try {
      const { customer } = editing
        ? await api.patch<{ customer: Customer }>(`/customers/${editing.id}`, {
            registrationType: 'dealer',
            dealerProfile,
            creditLimit: Number(form.creditLimit) || 0,
            discountPct: Number(form.discountPct) || 0,
            creditPeriodDays: Number(form.creditPeriodDays) || 30,
          })
        : await api.post<{ customer: Customer }>('/customers', {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone || undefined,
            registrationType: 'dealer',
            dealerProfile,
            creditLimit: Number(form.creditLimit) || 0,
            discountPct: Number(form.discountPct) || 0,
            creditPeriodDays: Number(form.creditPeriodDays) || 30,
          });

      // Sales Rep/Territory/Route live on a separate SalespersonAssignment
      // document, not on DealerProfile. form.salesRepId is a tenant User id
      // here (not a Salesperson id) — the backend resolves/auto-provisions
      // the Employee -> Salesperson chain for that login so it reliably
      // shows this dealer under "My Dealers".
      if (form.salesRepId) {
        try {
          await api.post('/salesperson-assignments', {
            userId: form.salesRepId,
            customerId: customer.id,
            territory: form.territory || undefined,
            routeId: form.routeId || undefined,
          });
        } catch (assignErr) {
          // Non-fatal — most commonly "already assigned" when editing a
          // dealer whose rep didn't change. The dealer record itself is
          // already saved successfully at this point.
          if (!(assignErr instanceof ApiError && assignErr.message.includes('already assigned'))) {
            toast.error('Dealer saved, but the sales rep assignment could not be updated');
          }
        }
      }

      toast.success(`${customer.dealerProfile?.dealerCode ?? customer.name} ${editing ? 'updated' : 'registered'}`);
      onCreated(customer);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Failed to ${editing ? 'update' : 'register'} dealer`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit dealer — ${editing.name}` : 'Register new dealer'}
      size="xl"
      footer={
      <>
          {stepIndex > 0 && <Button variant="secondary" onClick={goBack}>Back</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {step === 'documents' ?
          <Button onClick={save} loading={saving}>{editing ? 'Save changes' : 'Register dealer'}</Button> :

          <Button onClick={goNext} disabled={!canGoNext}>Next</Button>
          }
        </>
      }>

      <div className="mb-5 flex flex-wrap items-center justify-center gap-1.5">
        {STEPS.map((s, i) => <span key={s} title={STEP_LABELS[s]} className={`h-1.5 w-8 rounded-full ${i <= stepIndex ? 'bg-griptor-gradient' : 'bg-slate-200 dark:bg-slate-700'}`} />)}
      </div>
      <p className="mb-4 text-center text-xs font-bold uppercase tracking-wide text-slate-400">{STEP_LABELS[step]}</p>

      {step === 'basic' &&
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dl-name">Dealer name</Label>
            <Input id="dl-name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. ABC Tyre Centre" />
          </div>
          <div>
            <Label htmlFor="dl-email">Email</Label>
            <Input id="dl-email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="dl-phone">Phone</Label>
            <Input id="dl-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="dl-legal-name">Legal business name</Label>
            <Input id="dl-legal-name" value={form.legalBusinessName} onChange={(e) => setForm((f) => ({ ...f, legalBusinessName: e.target.value }))} placeholder="e.g. ABC Tyres (Pvt) Ltd" />
          </div>
          <div>
            <Label htmlFor="dl-trading-name">Trading name (optional)</Label>
            <Input id="dl-trading-name" value={form.tradingName} onChange={(e) => setForm((f) => ({ ...f, tradingName: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="dl-reg-no">Business registration no.</Label>
            <Input id="dl-reg-no" value={form.businessRegistrationNo} onChange={(e) => setForm((f) => ({ ...f, businessRegistrationNo: e.target.value }))} placeholder="e.g. PV123456" />
          </div>
          <div>
            <Label htmlFor="dl-business-type">Business type</Label>
            <Select id="dl-business-type" value={form.businessType} onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value as typeof form.businessType }))}>
              <option value="">— select —</option>
              {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="dl-category">Dealer category</Label>
            <Select id="dl-category" value={form.dealerCategory} onChange={(e) => setForm((f) => ({ ...f, dealerCategory: e.target.value as typeof form.dealerCategory }))}>
              <option value="">— select —</option>
              {DEALER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="dl-year">Year established</Label>
            <Input id="dl-year" type="number" min={1900} max={new Date().getFullYear()} value={form.yearEstablished} onChange={(e) => setForm((f) => ({ ...f, yearEstablished: e.target.value }))} />
          </div>
        </div>
      }

      {step === 'contacts' &&
      <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Main contact</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input placeholder="Contact person" value={form.mainPerson} onChange={(e) => setForm((f) => ({ ...f, mainPerson: e.target.value }))} />
              <Input placeholder="Designation" value={form.mainDesignation} onChange={(e) => setForm((f) => ({ ...f, mainDesignation: e.target.value }))} />
              <Input placeholder="Mobile" value={form.mainMobile} onChange={(e) => setForm((f) => ({ ...f, mainMobile: e.target.value }))} />
              <Input placeholder="Landline" value={form.mainLandline} onChange={(e) => setForm((f) => ({ ...f, mainLandline: e.target.value }))} />
              <Input placeholder="Email" value={form.mainEmail} onChange={(e) => setForm((f) => ({ ...f, mainEmail: e.target.value }))} />
              <Input placeholder="WhatsApp number" value={form.mainWhatsapp} onChange={(e) => setForm((f) => ({ ...f, mainWhatsapp: e.target.value }))} />
              <Input placeholder="Website" value={form.mainWebsite} onChange={(e) => setForm((f) => ({ ...f, mainWebsite: e.target.value }))} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Accounts contact</p>
            <p className="mb-2 text-xs text-text-gray dark:text-slate-400">Invoices, payments, and statements go here — set only if different from the main contact.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input placeholder="Name" value={form.accountsName} onChange={(e) => setForm((f) => ({ ...f, accountsName: e.target.value }))} />
              <Input placeholder="Phone" value={form.accountsPhone} onChange={(e) => setForm((f) => ({ ...f, accountsPhone: e.target.value }))} />
              <Input placeholder="Email" value={form.accountsEmail} onChange={(e) => setForm((f) => ({ ...f, accountsEmail: e.target.value }))} />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Purchasing contact</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input placeholder="Name" value={form.purchasingName} onChange={(e) => setForm((f) => ({ ...f, purchasingName: e.target.value }))} />
              <Input placeholder="Phone" value={form.purchasingPhone} onChange={(e) => setForm((f) => ({ ...f, purchasingPhone: e.target.value }))} />
              <Input placeholder="Email" value={form.purchasingEmail} onChange={(e) => setForm((f) => ({ ...f, purchasingEmail: e.target.value }))} />
            </div>
          </div>
        </div>
      }

      {step === 'addresses' &&
      <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Registered address</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input placeholder="Address line 1" value={form.regLine1} onChange={(e) => setForm((f) => ({ ...f, regLine1: e.target.value }))} />
              <Input placeholder="Address line 2" value={form.regLine2} onChange={(e) => setForm((f) => ({ ...f, regLine2: e.target.value }))} />
              <Input placeholder="City" value={form.regCity} onChange={(e) => setForm((f) => ({ ...f, regCity: e.target.value }))} />
              <Input placeholder="District" value={form.regDistrict} onChange={(e) => setForm((f) => ({ ...f, regDistrict: e.target.value }))} />
              <Input placeholder="Province" value={form.regProvince} onChange={(e) => setForm((f) => ({ ...f, regProvince: e.target.value }))} />
              <Input placeholder="Postal code" value={form.regPostalCode} onChange={(e) => setForm((f) => ({ ...f, regPostalCode: e.target.value }))} />
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Business address</p>
              <label className="flex items-center gap-2 text-xs text-text-gray dark:text-slate-400">
                Same as registered <Toggle checked={form.businessSameAsRegistered} onChange={(v) => setForm((f) => ({ ...f, businessSameAsRegistered: v }))} />
              </label>
            </div>
            {!form.businessSameAsRegistered &&
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input placeholder="Address" value={form.businessLine1} onChange={(e) => setForm((f) => ({ ...f, businessLine1: e.target.value }))} />
                <Input placeholder="City" value={form.businessCity} onChange={(e) => setForm((f) => ({ ...f, businessCity: e.target.value }))} />
                <Input placeholder="District" value={form.businessDistrict} onChange={(e) => setForm((f) => ({ ...f, businessDistrict: e.target.value }))} />
              </div>
          }
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Billing address</p>
              <label className="flex items-center gap-2 text-xs text-text-gray dark:text-slate-400">
                Same as business <Toggle checked={form.billingSameAsBusiness} onChange={(v) => setForm((f) => ({ ...f, billingSameAsBusiness: v }))} />
              </label>
            </div>
            {!form.billingSameAsBusiness && <Input placeholder="Billing address" value={form.billingAddress} onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))} />}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Delivery address</p>
              <label className="flex items-center gap-2 text-xs text-text-gray dark:text-slate-400">
                Same as business <Toggle checked={form.deliverySameAsBusiness} onChange={(v) => setForm((f) => ({ ...f, deliverySameAsBusiness: v }))} />
              </label>
            </div>
            {!form.deliverySameAsBusiness && <Input placeholder="Delivery address" value={form.deliveryAddress} onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))} />}
          </div>
        </div>
      }

      {step === 'tax' &&
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dl-tin">TIN</Label>
            <Input id="dl-tin" value={form.tin} onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value }))} />
          </div>
          <div className="flex items-end justify-between rounded-xl border border-border-soft px-3 py-2.5 dark:border-slate-700">
            <Label htmlFor="dl-vat-registered">VAT registered?</Label>
            <Toggle checked={form.vatRegistered} onChange={(v) => setForm((f) => ({ ...f, vatRegistered: v }))} />
          </div>
          {form.vatRegistered &&
        <div>
              <Label htmlFor="dl-vat-no">VAT number</Label>
              <Input id="dl-vat-no" value={form.vatNumber} onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))} />
            </div>
        }
          <div>
            <Label htmlFor="dl-svat-no">SVAT no. (optional)</Label>
            <Input id="dl-svat-no" value={form.svatNumber} onChange={(e) => setForm((f) => ({ ...f, svatNumber: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="dl-tax-type">Tax type (optional)</Label>
            <Input id="dl-tax-type" value={form.taxType} onChange={(e) => setForm((f) => ({ ...f, taxType: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="dl-tax-exempt">Tax exemption status (optional)</Label>
            <Input id="dl-tax-exempt" value={form.taxExemptionStatus} onChange={(e) => setForm((f) => ({ ...f, taxExemptionStatus: e.target.value }))} />
          </div>
        </div>
      }

      {step === 'owners' &&
      <div className="space-y-3">
          <p className="text-xs text-text-gray dark:text-slate-400">Owners, Directors, and Partners — important for credit applications.</p>
          {owners.map((o, i) =>
        <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-border-soft p-3 dark:border-slate-800 sm:grid-cols-6">
              <Input className="sm:col-span-2" placeholder="Full name" value={o.name} onChange={(e) => updateOwner(i, { name: e.target.value })} />
              <Input className="sm:col-span-2" placeholder="NIC / Passport" value={o.nicOrPassport} onChange={(e) => updateOwner(i, { nicOrPassport: e.target.value })} />
              <Select className="sm:col-span-1" value={o.role} onChange={(e) => updateOwner(i, { role: e.target.value as Owner['role'] })}>
                {OWNER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
              <button type="button" onClick={() => setOwners((prev) => prev.filter((_, idx) => idx !== i))} className="flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 sm:col-span-1">
                <TrashIcon className="h-4 w-4" />
              </button>
              <Input className="sm:col-span-2" placeholder="Designation" value={o.designation} onChange={(e) => updateOwner(i, { designation: e.target.value })} />
              <Input className="sm:col-span-2" placeholder="Mobile" value={o.mobile} onChange={(e) => updateOwner(i, { mobile: e.target.value })} />
              <Input className="sm:col-span-2" placeholder="Email" value={o.email} onChange={(e) => updateOwner(i, { email: e.target.value })} />
              <Input className="sm:col-span-6" placeholder="Address" value={o.address} onChange={(e) => updateOwner(i, { address: e.target.value })} />
            </div>
        )}
          <button type="button" onClick={() => setOwners((prev) => [...prev, emptyOwner()])} className="flex items-center gap-1 text-sm font-semibold text-royal hover:underline dark:text-blue-300">
            <PlusIcon className="h-4 w-4" /> Add owner / director
          </button>
        </div>
      }

      {step === 'signatories' &&
      <div className="space-y-3">
          <p className="text-xs text-text-gray dark:text-slate-400">Authorized signatories — particularly important when giving this dealer credit.</p>
          {signatories.map((s, i) =>
        <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-border-soft p-3 dark:border-slate-800 sm:grid-cols-6">
              <Input className="sm:col-span-2" placeholder="Name" value={s.name} onChange={(e) => updateSignatory(i, { name: e.target.value })} />
              <Input className="sm:col-span-2" placeholder="Designation" value={s.designation} onChange={(e) => updateSignatory(i, { designation: e.target.value })} />
              <Input className="sm:col-span-1" placeholder="NIC" value={s.nic} onChange={(e) => updateSignatory(i, { nic: e.target.value })} />
              <button type="button" onClick={() => setSignatories((prev) => prev.filter((_, idx) => idx !== i))} className="flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 sm:col-span-1">
                <TrashIcon className="h-4 w-4" />
              </button>
              <Input className="sm:col-span-2" placeholder="Mobile" value={s.mobile} onChange={(e) => updateSignatory(i, { mobile: e.target.value })} />
              <Select className="sm:col-span-2" value={s.signatureType} onChange={(e) => updateSignatory(i, { signatureType: e.target.value as Signatory['signatureType'] })}>
                {SIGNATORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <label className="flex items-center gap-2 text-sm text-text-gray dark:text-slate-400 sm:col-span-2">
                <Toggle checked={s.active} onChange={(v) => updateSignatory(i, { active: v })} /> Active
              </label>
            </div>
        )}
          <button type="button" onClick={() => setSignatories((prev) => [...prev, emptySignatory()])} className="flex items-center gap-1 text-sm font-semibold text-royal hover:underline dark:text-blue-300">
            <PlusIcon className="h-4 w-4" /> Add signatory
          </button>
        </div>
      }

      {step === 'assignment' &&
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dl-sales-rep">Sales representative</Label>
            <Select id="dl-sales-rep" value={form.salesRepId} onChange={(e) => setForm((f) => ({ ...f, salesRepId: e.target.value }))}>
              <option value="">— none —</option>
              {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </Select>
            <p className="mt-1 text-xs text-text-gray dark:text-slate-400">Whoever you pick will see this dealer under their own "My Dealers" page once they log in.</p>
          </div>
          <div>
            <Label htmlFor="dl-territory">Sales territory</Label>
            <Input id="dl-territory" value={form.territory} onChange={(e) => setForm((f) => ({ ...f, territory: e.target.value }))} placeholder="e.g. Colombo South" />
          </div>
          <div>
            <Label htmlFor="dl-region">Region</Label>
            <Input id="dl-region" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} placeholder="e.g. Western" />
          </div>
          <div>
            <Label htmlFor="dl-route">Route</Label>
            <Select id="dl-route" value={form.routeId} onChange={(e) => setForm((f) => ({ ...f, routeId: e.target.value }))}>
              <option value="">— none —</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="dl-branch">Branch</Label>
            <Select id="dl-branch" value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}>
              <option value="">— none —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="dl-class">Dealer class</Label>
            <Input id="dl-class" value={form.dealerClass} onChange={(e) => setForm((f) => ({ ...f, dealerClass: e.target.value }))} placeholder="e.g. A" />
          </div>
          <div>
            <Label htmlFor="dl-group">Dealer group</Label>
            <Input id="dl-group" value={form.dealerGroup} onChange={(e) => setForm((f) => ({ ...f, dealerGroup: e.target.value }))} />
          </div>
        </div>
      }

      {step === 'commercial' &&
      <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dl-payment-type">Payment type</Label>
              <Select id="dl-payment-type" value={form.paymentType} onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value as typeof form.paymentType }))}>
                <option value="">— select —</option>
                {PAYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="dl-credit-period">Credit period (days)</Label>
              <Input id="dl-credit-period" type="number" min={1} placeholder="30" value={form.creditPeriodDays} onChange={(e) => setForm((f) => ({ ...f, creditPeriodDays: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="dl-credit-limit">Credit limit</Label>
              <Input id="dl-credit-limit" type="number" min={0} value={form.creditLimit} onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="dl-discount">Discount %</Label>
              <Input id="dl-discount" type="number" min={0} max={100} value={form.discountPct} onChange={(e) => setForm((f) => ({ ...f, discountPct: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Bank details</p>
            {bankAccounts.map((b, i) =>
          <div key={i} className="grid grid-cols-1 gap-2 rounded-xl border border-border-soft p-3 dark:border-slate-800 sm:grid-cols-6">
                <Input className="sm:col-span-2" placeholder="Bank name" value={b.bankName} onChange={(e) => updateBankAccount(i, { bankName: e.target.value })} />
                <Input className="sm:col-span-2" placeholder="Branch" value={b.branch} onChange={(e) => updateBankAccount(i, { branch: e.target.value })} />
                <Input className="sm:col-span-1" placeholder="Bank/branch code" value={b.bankCode} onChange={(e) => updateBankAccount(i, { bankCode: e.target.value })} />
                <button type="button" onClick={() => setBankAccounts((prev) => prev.filter((_, idx) => idx !== i))} className="flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 sm:col-span-1">
                  <TrashIcon className="h-4 w-4" />
                </button>
                <Input className="sm:col-span-2" placeholder="Account name" value={b.accountName} onChange={(e) => updateBankAccount(i, { accountName: e.target.value })} />
                <Input className="sm:col-span-2" placeholder="Account number" value={b.accountNumber} onChange={(e) => updateBankAccount(i, { accountNumber: e.target.value })} />
                <Input className="sm:col-span-2" placeholder="Account type" value={b.accountType} onChange={(e) => updateBankAccount(i, { accountType: e.target.value })} />
              </div>
          )}
            <button type="button" onClick={() => setBankAccounts((prev) => [...prev, emptyBankAccount()])} className="flex items-center gap-1 text-sm font-semibold text-royal hover:underline dark:text-blue-300">
              <PlusIcon className="h-4 w-4" /> Add bank account
            </button>
          </div>
        </div>
      }

      {step === 'business' &&
      <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="dl-outlets">Number of outlets</Label>
              <Input id="dl-outlets" type="number" min={0} value={form.numberOutlets} onChange={(e) => setForm((f) => ({ ...f, numberOutlets: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="dl-employees">Number of employees</Label>
              <Input id="dl-employees" type="number" min={0} value={form.numberEmployees} onChange={(e) => setForm((f) => ({ ...f, numberEmployees: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="dl-sales-staff">Number of sales staff</Label>
              <Input id="dl-sales-staff" type="number" min={0} value={form.numberSalesStaff} onChange={(e) => setForm((f) => ({ ...f, numberSalesStaff: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="dl-vehicles">Number of vehicles / fleet</Label>
              <Input id="dl-vehicles" type="number" min={0} value={form.numberVehicles} onChange={(e) => setForm((f) => ({ ...f, numberVehicles: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="dl-monthly-purchase">Approx. monthly purchase</Label>
              <Input id="dl-monthly-purchase" type="number" min={0} value={form.approxMonthlyPurchase} onChange={(e) => setForm((f) => ({ ...f, approxMonthlyPurchase: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="dl-annual-purchase">Approx. annual purchase</Label>
              <Input id="dl-annual-purchase" type="number" min={0} value={form.approxAnnualPurchase} onChange={(e) => setForm((f) => ({ ...f, approxAnnualPurchase: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="dl-segment">Customer segment</Label>
              <Select id="dl-segment" value={form.customerSegment} onChange={(e) => setForm((f) => ({ ...f, customerSegment: e.target.value as typeof form.customerSegment }))}>
                <option value="">— select —</option>
                {CUSTOMER_SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="dl-brands">Brands currently selling</Label>
            <Input id="dl-brands" placeholder="Comma-separated, e.g. Michelin, Bridgestone" value={form.brandsSelling} onChange={(e) => setForm((f) => ({ ...f, brandsSelling: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="dl-competitors">Main competitor brands</Label>
            <Input id="dl-competitors" placeholder="Comma-separated" value={form.competitorBrands} onChange={(e) => setForm((f) => ({ ...f, competitorBrands: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="dl-tyre-sizes">Main tyre sizes sold</Label>
            <Input id="dl-tyre-sizes" placeholder="Comma-separated, e.g. 185/65R15, 195/55R16" value={form.mainTyreSizes} onChange={(e) => setForm((f) => ({ ...f, mainTyreSizes: e.target.value }))} />
          </div>
        </div>
      }

      {step === 'documents' &&
      <div className="space-y-3">
          {!editing &&
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Save this dealer first, then reopen Edit to upload documents.
            </p>
        }
          <ul className="divide-y divide-border-soft dark:divide-slate-800">
            {DEALER_DOCUMENT_TYPES.map((docType) => {
              const doc = documents.find((d) => d.documentType === docType);
              return (
                <li key={docType} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy dark:text-slate-100">{docType}</p>
                    {doc ?
                  <a href={doc.attachment.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-royal hover:underline dark:text-blue-300">
                        {doc.attachment.contentType?.startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5" /> : <FileTextIcon className="h-3.5 w-3.5" />}
                        {doc.attachment.name}
                      </a> :

                  <p className="text-xs text-text-gray dark:text-slate-500">Not uploaded</p>
                  }
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                    type="file"
                    id={`dl-doc-${docType}`}
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    disabled={!editing || uploadingType === docType}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) uploadDocument(docType, file);
                    }} />

                    <Button
                    size="sm"
                    variant="secondary"
                    disabled={!editing}
                    loading={uploadingType === docType}
                    onClick={() => document.getElementById(`dl-doc-${docType}`)?.click()}>

                      <UploadIcon className="h-3.5 w-3.5" /> {doc ? 'Replace' : 'Upload'}
                    </Button>
                    {doc &&
                  <button type="button" onClick={() => removeDocument(docType)} className="flex items-center justify-center rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                  }
                  </div>
                </li>);

            })}
          </ul>
        </div>
      }
    </Modal>);

}
