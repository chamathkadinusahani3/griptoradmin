import { UserDoc } from './models/User';
import { ClientDoc } from './models/Client';
import { LeadDoc } from './models/Lead';
import { InvoiceDoc } from './models/Invoice';
import { TicketDoc } from './models/Ticket';
import { CustomerDoc } from './models/Customer';
import { TechnicianDoc } from './models/Technician';
import { JobCardDoc } from './models/JobCard';
import { SupplierDoc } from './models/Supplier';
import { PartDoc } from './models/Part';
import { InspectionDoc } from './models/Inspection';
import { SaleDoc } from './models/Sale';
import { ReminderDoc } from './models/Reminder';
import { FeedbackDoc } from './models/Feedback';
import { ServiceDoc } from './models/Service';
import { BookingDoc } from './models/Booking';
import { BayDoc } from './models/Bay';
import { QuotationDoc } from './models/Quotation';
import { CustomerInvoiceDoc } from './models/CustomerInvoice';
import { VehicleDoc } from './models/Vehicle';
import { LoyaltyRewardDoc } from './models/LoyaltyReward';
import { CallLogDoc } from './models/CallLog';
import { ApprovalDoc } from './models/Approval';
import { BranchDoc } from './models/Branch';
import { MessageTemplateDoc } from './models/MessageTemplate';
import { SmsLogDoc } from './models/SmsLog';

const DEFAULT_NOTIFICATION_PREFS = {
  newLeads: true,
  failedPayments: true,
  newTickets: true,
  weeklyDigest: false,
  productUpdates: true,
};

// Same defaults-backfill reasoning as DEFAULT_NOTIFICATION_PREFS above —
// clients created before `branding` existed on the schema won't have it
// populated in Mongo (schema defaults only apply on document construction),
// so merge over this rather than trusting what's actually stored.
const DEFAULT_BRANDING = {
  paletteId: 'blue',
  logoDataUrl: undefined as string | undefined,
  defaultMode: 'light' as 'light' | 'dark',
};

export function serializeUser(user: UserDoc, client?: ClientDoc | null) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    clientId: client?._id?.toString(),
    garageName: client?.name,
    garageSlug: client?.slug,
    modules: client?.modules,
    addOns: client?.addOns,
    branding: { ...DEFAULT_BRANDING, ...client?.branding },
    status: user.status,
    teamRole: user.teamRole,
    // Same backfill-at-read discipline as teamRole/notificationPrefs — every
    // tenant User created before this field existed defaults to Owner.
    tenantRole: user.role === 'tenant' ? user.tenantRole ?? 'Owner' : undefined,
    branchId: user.branchId?.toString(),
    // Documents created before notificationPrefs existed (or updated via
    // dot-notation $set on individual keys) may be missing some/all of
    // these sub-fields in Mongo — merge over defaults so the response is
    // always complete regardless of what's actually stored.
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...user.notificationPrefs },
  };
}

export function serializeLead(lead: LeadDoc) {
  return {
    id: lead._id.toString(),
    name: lead.name,
    email: lead.email,
    company: lead.company,
    businessType: lead.businessType,
    message: lead.message,
    status: lead.status,
    date: (lead as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeInvoice(invoice: InvoiceDoc, clientName?: string) {
  return {
    id: invoice._id.toString(),
    clientId: invoice.clientId.toString(),
    client: clientName,
    plan: invoice.plan,
    amount: invoice.amount,
    status: invoice.status,
    date: (invoice as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeTicket(ticket: TicketDoc, clientName?: string) {
  return {
    id: ticket._id.toString(),
    clientId: ticket.clientId.toString(),
    client: clientName,
    subject: ticket.subject,
    priority: ticket.priority,
    status: ticket.status,
    assignee: ticket.assignee,
    thread: ticket.thread,
    updated: (ticket as unknown as { updatedAt: Date }).updatedAt,
  };
}

export function serializeCustomer(customer: CustomerDoc) {
  return {
    id: customer._id.toString(),
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    vehicles: customer.vehicles,
    tags: customer.tags,
    visits: customer.visits,
    lastVisit: customer.lastVisit,
    loyaltyPoints: customer.loyaltyPoints,
    totalSpend: customer.totalSpend,
    type: customer.type ?? 'individual',
    contactPerson: customer.contactPerson,
    creditLimit: customer.creditLimit ?? 0,
    discountPct: customer.discountPct ?? 0,
    hasPortalAccount: !!customer.passwordHash,
  };
}

export function serializeLoyaltyReward(reward: LoyaltyRewardDoc) {
  return {
    id: reward._id.toString(),
    name: reward.name,
    pointsCost: reward.pointsCost,
    active: reward.active,
  };
}

export function serializeCallLog(call: CallLogDoc, customerName?: string) {
  return {
    id: call._id.toString(),
    customerId: call.customerId.toString(),
    customer: customerName,
    direction: call.direction,
    reason: call.reason,
    status: call.status,
    durationMinutes: call.durationMinutes,
    notes: call.notes,
    followUpDue: call.followUpDue,
    reminderId: call.reminderId?.toString(),
    createdAt: (call as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeApproval(approval: ApprovalDoc, requestedByName?: string, respondedByName?: string) {
  return {
    id: approval._id.toString(),
    type: approval.type,
    subject: approval.subject,
    amount: approval.amount,
    requestedBy: approval.requestedBy.toString(),
    requestedByName,
    status: approval.status,
    respondedBy: approval.respondedBy?.toString(),
    respondedByName,
    respondedAt: approval.respondedAt,
    notes: approval.notes,
    createdAt: (approval as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeMessageTemplate(template: MessageTemplateDoc) {
  return {
    id: template._id.toString(),
    name: template.name,
    body: template.body,
  };
}

export function serializeSmsLog(log: SmsLogDoc, customerName?: string) {
  return {
    id: log._id.toString(),
    customerId: log.customerId?.toString(),
    customer: customerName,
    to: log.to,
    message: log.message,
    sent: log.sent,
    error: log.error,
    createdAt: (log as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeBranch(branch: BranchDoc) {
  return {
    id: branch._id.toString(),
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    isDefault: branch.isDefault,
  };
}

export function serializeVehicle(vehicle: VehicleDoc) {
  return {
    id: vehicle._id.toString(),
    customerId: vehicle.customerId.toString(),
    label: vehicle.label,
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    notes: vehicle.notes,
  };
}

export function serializeTechnician(
  tech: TechnicianDoc,
  activeJobs = 0,
  completedToday = 0,
  attendance?: { status: string; clockInAt?: Date } | null
) {
  return {
    id: tech._id.toString(),
    name: tech.name,
    specialty: tech.specialty,
    status: tech.status,
    avatar: tech.avatar,
    activeJobs,
    completedToday,
    attendanceStatus: attendance?.status ?? 'off',
    clockInAt: attendance?.clockInAt,
    branchId: tech.branchId?.toString(),
    hourlyRate: tech.hourlyRate,
    // Same backfill-at-read discipline used throughout this project — a
    // schema default doesn't retroactively apply to pre-existing documents.
    maxConcurrentJobs: tech.maxConcurrentJobs ?? 4,
    active: tech.active ?? true,
  };
}

export function serializeJobCard(job: JobCardDoc, customerName?: string, technicianName?: string, bayName?: string) {
  return {
    id: job._id.toString(),
    customerId: job.customerId.toString(),
    customer: customerName,
    vehicle: job.vehicle,
    plate: job.plate,
    vehicleId: job.vehicleId?.toString(),
    service: job.service,
    technicianId: job.technicianId.toString(),
    technician: technicianName,
    estimate: job.estimate,
    status: job.status,
    checklist: job.checklist,
    bayId: job.bayId?.toString(),
    bay: bayName,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    branchId: job.branchId?.toString(),
    partsUsed: job.partsUsed.map((p) => ({ partId: p.partId.toString(), name: p.name, price: p.price, qty: p.qty })),
    laborCost: job.laborCost,
    createdAt: (job as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeBay(
  bay: BayDoc,
  occupant?: { jobCardId: string; vehicle: string; technician?: string } | null
) {
  return {
    id: bay._id.toString(),
    name: bay.name,
    status: occupant ? 'Occupied' : 'Free',
    jobCardId: occupant?.jobCardId,
    vehicle: occupant?.vehicle,
    technician: occupant?.technician,
    branchId: bay.branchId?.toString(),
  };
}

export function serializeSupplier(supplier: SupplierDoc) {
  return {
    id: supplier._id.toString(),
    name: supplier.name,
    contact: supplier.contact,
    email: supplier.email,
    openOrders: supplier.openOrders,
    lastOrder: supplier.lastOrder,
    onTime: supplier.onTime,
  };
}

export function serializePart(part: PartDoc, supplierName?: string) {
  return {
    id: part._id.toString(),
    name: part.name,
    sku: part.sku,
    barcode: part.barcode,
    category: part.category,
    stock: part.stock,
    reorderAt: part.reorderAt,
    price: part.price,
    supplierId: part.supplierId?.toString(),
    supplier: supplierName,
    branchId: part.branchId?.toString(),
  };
}

export function serializeInspection(insp: InspectionDoc, customerName?: string, technicianName?: string) {
  return {
    id: insp._id.toString(),
    customerId: insp.customerId.toString(),
    customer: customerName,
    technicianId: insp.technicianId.toString(),
    technician: technicianName,
    jobCardId: insp.jobCardId?.toString(),
    vehicle: insp.vehicle,
    plate: insp.plate,
    result: insp.result,
    media: insp.media ?? [],
    items: insp.items,
    notes: insp.notes,
    additionalCost: insp.additionalCost,
    approvalStatus: insp.approvalStatus,
    approvalToken: insp.approvalToken,
    approvalRequestedAt: insp.approvalRequestedAt,
    approvalRespondedAt: insp.approvalRespondedAt,
    date: (insp as unknown as { createdAt: Date }).createdAt,
  };
}

// Lean shape for the public approval page — deliberately excludes clientId,
// technicianId, and the approvalToken itself (the URL already has it; no
// need to echo it back in every response body).
export function serializePublicInspection(insp: InspectionDoc) {
  return {
    vehicle: insp.vehicle,
    plate: insp.plate,
    result: insp.result,
    media: insp.media ?? [],
    notes: insp.notes,
    additionalCost: insp.additionalCost,
    approvalStatus: insp.approvalStatus,
    date: (insp as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeSale(sale: SaleDoc) {
  return {
    id: sale._id.toString(),
    items: sale.items.map((line) => ({
      partId: line.partId.toString(),
      name: line.name,
      price: line.price,
      qty: line.qty,
    })),
    subtotal: sale.subtotal,
    tax: sale.tax,
    total: sale.total,
    branchId: sale.branchId?.toString(),
    date: (sale as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeReminder(reminder: ReminderDoc, customerName?: string) {
  return {
    id: reminder._id.toString(),
    customerId: reminder.customerId.toString(),
    customer: customerName,
    vehicle: reminder.vehicle,
    type: reminder.type,
    channel: reminder.channel,
    status: reminder.status,
    scheduledFor: reminder.scheduledFor,
  };
}

export function serializeFeedback(feedback: FeedbackDoc, customerName?: string) {
  return {
    id: feedback._id.toString(),
    customerId: feedback.customerId.toString(),
    customer: customerName,
    service: feedback.service,
    rating: feedback.rating,
    comment: feedback.comment,
    responded: feedback.responded,
    date: (feedback as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeClient(client: ClientDoc) {
  return {
    id: client._id.toString(),
    name: client.name,
    contact: client.contact,
    email: client.email,
    plan: client.plan,
    status: client.status,
    modules: client.modules,
    addOns: client.addOns,
    disabledCoreFeatures: client.disabledCoreFeatures ?? [],
    signupDate: client.signupDate,
    mrr: client.mrr,
    locations: client.locations,
    staff: client.staff,
    branding: { ...DEFAULT_BRANDING, ...client.branding },
    slug: client.slug,
    capacityPerSlot: client.capacityPerSlot,
    hasSmsConfig: !!(client.smsConfig?.userId && client.smsConfig?.apiKey),
    smsSenderId: client.smsConfig?.senderId,
  };
}

export function serializeService(service: ServiceDoc) {
  return {
    id: service._id.toString(),
    name: service.name,
    category: service.category,
    durationMinutes: service.durationMinutes,
    active: service.active,
  };
}

export function serializeBooking(
  booking: BookingDoc,
  customerName?: string,
  serviceNames?: string[]
) {
  return {
    id: booking._id.toString(),
    customerId: booking.customerId.toString(),
    customer: customerName,
    serviceIds: booking.serviceIds.map((id) => id.toString()),
    services: serviceNames,
    vehicle: booking.vehicle,
    plate: booking.plate,
    date: booking.date,
    timeSlot: booking.timeSlot,
    status: booking.status,
    notes: booking.notes,
    source: booking.source,
    jobCardId: booking.jobCardId?.toString(),
    branchId: booking.branchId?.toString(),
    createdAt: (booking as unknown as { createdAt: Date }).createdAt,
  };
}

/** Lean shape for the public booking wizard — customer-facing only. */
export function serializePublicBooking(booking: BookingDoc) {
  return {
    id: booking._id.toString(),
    date: booking.date,
    timeSlot: booking.timeSlot,
    status: booking.status,
  };
}

export function serializeQuotation(q: QuotationDoc, customerName?: string) {
  return {
    id: q._id.toString(),
    quoteNumber: q.quoteNumber,
    customerId: q.customerId.toString(),
    customer: customerName,
    jobCardId: q.jobCardId?.toString(),
    vehicle: q.vehicle,
    plate: q.plate,
    vehicleId: q.vehicleId?.toString(),
    items: q.items,
    subtotal: q.subtotal,
    discountPct: q.discountPct ?? 0,
    discountAmount: q.discountAmount ?? 0,
    taxAmount: q.taxAmount,
    total: q.total,
    status: q.status,
    validUntil: q.validUntil,
    notes: q.notes,
    createdAt: (q as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeCustomerInvoice(inv: CustomerInvoiceDoc, customerName?: string) {
  return {
    id: inv._id.toString(),
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId.toString(),
    customer: customerName,
    jobCardId: inv.jobCardId?.toString(),
    quotationId: inv.quotationId?.toString(),
    vehicle: inv.vehicle,
    plate: inv.plate,
    vehicleId: inv.vehicleId?.toString(),
    items: inv.items,
    subtotal: inv.subtotal,
    discountPct: inv.discountPct ?? 0,
    discountAmount: inv.discountAmount ?? 0,
    taxAmount: inv.taxAmount,
    total: inv.total,
    status: inv.status,
    paidAmount: inv.paidAmount,
    balance: inv.balance,
    paymentStatus: inv.paymentStatus,
    paymentHistory: inv.paymentHistory,
    dueDate: inv.dueDate,
    notes: inv.notes,
    createdAt: (inv as unknown as { createdAt: Date }).createdAt,
  };
}
