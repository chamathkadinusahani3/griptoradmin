import { UserDoc } from './models/User.js';
import { ClientDoc } from './models/Client.js';
import { LeadDoc } from './models/Lead.js';
import { InvoiceDoc } from './models/Invoice.js';
import { TicketDoc } from './models/Ticket.js';
import { CustomerDoc } from './models/Customer.js';
import { TechnicianDoc } from './models/Technician.js';
import { JobCardDoc } from './models/JobCard.js';
import { SupplierDoc } from './models/Supplier.js';
import { PartDoc } from './models/Part.js';
import { BankAccountDoc } from './models/BankAccount.js';
import { ReturnDoc } from './models/Return.js';
import { ComplaintDoc } from './models/Complaint.js';
import { InspectionDoc } from './models/Inspection.js';
import { SaleDoc } from './models/Sale.js';
import { ReminderDoc } from './models/Reminder.js';
import { FeedbackDoc } from './models/Feedback.js';
import { ServiceDoc } from './models/Service.js';
import { BookingDoc } from './models/Booking.js';
import { BayDoc } from './models/Bay.js';
import { QuotationDoc } from './models/Quotation.js';
import { CustomerInvoiceDoc } from './models/CustomerInvoice.js';
import { VehicleDoc } from './models/Vehicle.js';
import { LoyaltyRewardDoc } from './models/LoyaltyReward.js';
import { CallLogDoc } from './models/CallLog.js';
import { ApprovalDoc } from './models/Approval.js';
import { BranchDoc } from './models/Branch.js';
import { MessageTemplateDoc } from './models/MessageTemplate.js';
import { SmsLogDoc } from './models/SmsLog.js';
import { PurchaseOrderDoc } from './models/PurchaseOrder.js';
import { ExpenseDoc } from './models/Expense.js';
import { PayrollRunDoc } from './models/PayrollRun.js';
import { PricingTierDoc } from './models/PricingTier.js';
import { EmployeeDoc } from './models/Employee.js';
import { LeaveRequestDoc } from './models/LeaveRequest.js';
import { JobOpeningDoc } from './models/JobOpening.js';
import { CandidateDoc } from './models/Candidate.js';
import { PerformanceReviewDoc } from './models/PerformanceReview.js';
import { RoleDoc } from './models/Role.js';
import { DEPARTMENT_BY_ROLE_NAME } from './roleSeed.js';

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
  accentColor: undefined as string | undefined,
  sidebarStyle: 'expanded' as 'expanded' | 'compact',
  fontFamily: 'Inter',
};

export function serializeUser(user: UserDoc, client?: ClientDoc | null, role?: { id: string; name: string; permissions: string[]; isOwner: boolean } | null) {
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
    // DEPRECATED (see api/_lib/models/Role.ts) — kept only so any
    // not-yet-migrated frontend read still sees a sane value during the
    // phased rollout. Same backfill-at-read discipline as before.
    tenantRole: user.role === 'tenant' ? user.tenantRole ?? 'Owner' : undefined,
    roleId: role?.id ?? user.roleId?.toString(),
    roleName: role?.name,
    // A per-user override (User.permissionOverrides) fully replaces the
    // role's list — never consulted for the Owner, who is unconditional.
    permissions: role?.isOwner ? role.permissions : user.permissionOverrides ?? role?.permissions,
    hasCustomPermissions: role?.isOwner ? false : !!user.permissionOverrides,
    isOwner: role?.isOwner ?? false,
    creditLimit: user.creditLimit ?? 0,
    branchId: user.branchId?.toString(),
    phone: user.phone,
    createdAt: (user as unknown as { createdAt?: Date }).createdAt,
    lastLoginAt: user.lastLoginAt,
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
    creditPeriodDays: customer.creditPeriodDays ?? 30,
    hasPortalAccount: !!customer.passwordHash,
    sourceModule: customer.sourceModule,
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

export function serializeRole(role: RoleDoc) {
  return {
    id: role._id.toString(),
    name: role.name,
    department: role.department ?? DEPARTMENT_BY_ROLE_NAME[role.name],
    isProtectedOwner: role.isProtectedOwner,
    permissions: role.permissions,
    branchPinned: role.branchPinned,
    requiresCreditLimit: role.requiresCreditLimit,
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
    source: log.source ?? 'manual',
    partId: log.partId?.toString(),
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
    capacityPerSlot: branch.capacityPerSlot,
    serviceCategories: branch.serviceCategories,
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

// `stats` are derived live from real PurchaseOrder documents by the caller
// (api/suppliers/index.ts) — the direct fix for openOrders/lastOrder/onTime
// having been dead decorative Supplier fields since the original migration
// (never written by any endpoint). Falls back to the stored (always-zero)
// column only when the caller doesn't pass stats, so this stays a safe
// drop-in for any other future caller of serializeSupplier.
export function serializeSupplier(
  supplier: SupplierDoc,
  stats?: {
    openOrders: number;
    lastOrder: Date | null;
    onTime: number | null;
    totalOutstanding?: number;
    totalPaid?: number;
  }
) {
  return {
    id: supplier._id.toString(),
    name: supplier.name,
    contact: supplier.contact,
    email: supplier.email,
    openOrders: stats ? stats.openOrders : supplier.openOrders,
    lastOrder: stats ? stats.lastOrder ?? undefined : supplier.lastOrder,
    onTime: stats ? stats.onTime ?? undefined : supplier.onTime,
    totalOutstanding: stats?.totalOutstanding ?? 0,
    totalPaid: stats?.totalPaid ?? 0,
  };
}

export function serializeReturn(ret: ReturnDoc, party?: string, reference?: string) {
  return {
    id: ret._id.toString(),
    direction: ret.direction,
    sourceType: ret.sourceType,
    sourceId: ret.sourceId.toString(),
    returnNumber: ret.returnNumber,
    items: ret.items.map((i) => ({ partId: i.partId.toString(), name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
    totalAmount: ret.totalAmount,
    reason: ret.reason,
    notes: ret.notes,
    refundAmount: ret.refundAmount,
    refundMethod: ret.refundMethod,
    chequeNumber: ret.chequeNumber,
    bankAccountId: ret.bankAccountId?.toString(),
    refundDate: ret.refundDate,
    reconciled: !!ret.reconciled,
    reconciledAt: ret.reconciledAt,
    party,
    reference,
    createdAt: (ret as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeComplaint(complaint: ComplaintDoc, partyName?: string) {
  return {
    id: complaint._id.toString(),
    direction: complaint.direction,
    customerId: complaint.customerId?.toString(),
    supplierId: complaint.supplierId?.toString(),
    party: partyName,
    complaintNumber: complaint.complaintNumber,
    category: complaint.category,
    subject: complaint.subject,
    description: complaint.description,
    priority: complaint.priority ?? 'Medium',
    status: complaint.status ?? 'Open',
    resolution: complaint.resolution,
    resolvedAt: complaint.resolvedAt,
    jobCardId: complaint.jobCardId?.toString(),
    purchaseOrderId: complaint.purchaseOrderId?.toString(),
    createdAt: (complaint as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeBankAccount(account: BankAccountDoc) {
  return {
    id: account._id.toString(),
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    accountHolderName: account.accountHolderName,
    branch: account.branch,
    notes: account.notes,
    createdAt: (account as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeExpense(expense: ExpenseDoc) {
  return {
    id: expense._id.toString(),
    expenseNumber: expense.expenseNumber,
    branchId: expense.branchId?.toString(),
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
    date: expense.date,
    vendorName: expense.vendorName,
    notes: expense.notes,
    createdAt: (expense as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializePayrollRun(run: PayrollRunDoc) {
  return {
    id: run._id.toString(),
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    status: run.status,
    lines: run.lines.map((l) => ({
      technicianId: l.technicianId.toString(),
      technicianName: l.technicianName,
      hourlyRate: l.hourlyRate,
      hoursWorked: l.hoursWorked,
      grossPay: l.grossPay,
      missingRate: l.missingRate,
    })),
    totalAmount: run.totalAmount,
    finalizedAt: run.finalizedAt,
    paidAt: run.paidAt,
    createdAt: (run as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializePricingTier(tier: PricingTierDoc) {
  return {
    id: tier.tierId,
    name: tier.name,
    price: tier.price ?? null,
    cadence: tier.cadence,
    popular: tier.popular,
    description: tier.description,
    features: tier.features,
    hidden: !!tier.hidden,
  };
}

export function serializePurchaseOrder(order: PurchaseOrderDoc, supplierName?: string) {
  return {
    id: order._id.toString(),
    poNumber: order.poNumber,
    supplierId: order.supplierId.toString(),
    supplier: supplierName,
    branchId: order.branchId?.toString(),
    items: order.items.map((i) => ({ partId: i.partId.toString(), name: i.name, quantity: i.quantity, unitCost: i.unitCost })),
    subtotal: order.subtotal,
    total: order.total,
    status: order.status,
    expectedDate: order.expectedDate,
    receivedAt: order.receivedAt,
    notes: order.notes,
    paidAmount: order.paidAmount ?? 0,
    balance: order.balance ?? order.total,
    paymentStatus: order.paymentStatus ?? 'Unpaid',
    paymentHistory: (order.paymentHistory ?? []).map((p) => ({
      id: p._id?.toString(),
      amount: p.amount,
      method: p.method,
      date: p.date,
      notes: p.notes,
      chequeNumber: p.chequeNumber,
      bankAccountId: p.bankAccountId?.toString(),
      reconciled: !!p.reconciled,
      reconciledAt: p.reconciledAt,
    })),
    createdAt: (order as unknown as { createdAt: Date }).createdAt,
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
    alertsPhone: client.alertsPhone,
    trialEndsAt: client.trialEndsAt,
    payhereSubscriptionId: client.payhereSubscriptionId,
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
  serviceNames?: string[],
  bayName?: string
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
    bayId: booking.bayId?.toString(),
    bay: bayName,
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
    paymentHistory: inv.paymentHistory.map((p) => ({
      id: p._id?.toString(),
      amount: p.amount,
      method: p.method,
      date: p.date,
      notes: p.notes,
      payherePaymentId: p.payherePaymentId,
      chequeNumber: p.chequeNumber,
      bankAccountId: p.bankAccountId?.toString(),
      reconciled: !!p.reconciled,
      reconciledAt: p.reconciledAt,
    })),
    dueDate: inv.dueDate,
    notes: inv.notes,
    createdAt: (inv as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeEmployee(userId: string, name: string, email: string, tenantRole: string | null | undefined, employee: EmployeeDoc | null) {
  return {
    userId,
    name,
    email,
    tenantRole: tenantRole ?? 'Owner',
    hasProfile: !!employee,
    dateOfBirth: employee?.dateOfBirth,
    address: employee?.address,
    nationalId: employee?.nationalId,
    emergencyContactName: employee?.emergencyContactName,
    emergencyContactPhone: employee?.emergencyContactPhone,
    hireDate: employee?.hireDate,
    employmentType: employee?.employmentType ?? 'Full-time',
    notes: employee?.notes,
  };
}

export function serializeLeaveRequest(leave: LeaveRequestDoc, requestedByName?: string, respondedByName?: string) {
  return {
    id: leave._id.toString(),
    requestedBy: leave.requestedBy.toString(),
    requestedByName,
    type: leave.type,
    startDate: leave.startDate,
    endDate: leave.endDate,
    reason: leave.reason,
    status: leave.status,
    respondedBy: leave.respondedBy?.toString(),
    respondedByName,
    respondedAt: leave.respondedAt,
    responseNote: leave.responseNote,
    createdAt: (leave as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeJobOpening(opening: JobOpeningDoc, candidateCount = 0) {
  return {
    id: opening._id.toString(),
    title: opening.title,
    description: opening.description,
    status: opening.status,
    candidateCount,
    createdAt: (opening as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializeCandidate(candidate: CandidateDoc) {
  return {
    id: candidate._id.toString(),
    openingId: candidate.openingId.toString(),
    name: candidate.name,
    email: candidate.email,
    phone: candidate.phone,
    status: candidate.status,
    notes: candidate.notes,
    createdAt: (candidate as unknown as { createdAt: Date }).createdAt,
  };
}

export function serializePerformanceReview(review: PerformanceReviewDoc, employeeName?: string, reviewedByName?: string) {
  return {
    id: review._id.toString(),
    employeeUserId: review.employeeUserId.toString(),
    employeeName,
    reviewedBy: review.reviewedBy.toString(),
    reviewedByName,
    reviewDate: review.reviewDate,
    rating: review.rating,
    feedback: review.feedback,
    createdAt: (review as unknown as { createdAt: Date }).createdAt,
  };
}
