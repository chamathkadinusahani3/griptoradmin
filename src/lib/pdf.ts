import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LineItem } from '../types/quotation';
import { formatCurrency, formatDate } from './utils';

// Dealer Credit Control roadmap Module 7 — a Sales-facing document (Sales
// Order, Quotation, Customer Invoice) and a Purchase-facing one (Purchase
// Order, GRN) get distinct accent colors, so a printed stack of both is
// visually sortable at a glance, per the spec's "instantly tell them
// apart" requirement. Reuses this app's own brand blue (sales) and an
// amber/brown (purchase) — not arbitrary, chosen for contrast against the
// existing blue used throughout the UI.
export const PDF_KIND_COLORS: Record<'sales' | 'purchase', [number, number, number]> = {
  sales: [33, 100, 180],
  purchase: [180, 95, 6],
};

export interface PdfDocument {
  title: string; // "Quotation" or "Invoice"
  number: string;
  date: string;
  garageName?: string;
  customerName?: string;
  /** Unset for a document with no vehicle concept (e.g. a Sales Order, a parts/counter order) — that line is simply omitted. */
  vehicle?: string;
  plate?: string;
  items: LineItem[];
  subtotal: number;
  discountPct?: number;
  discountAmount?: number;
  taxAmount: number;
  total: number;
  /** Extra label/value rows shown below the totals — e.g. status, paid, balance. */
  extraLines?: { label: string; value: string }[];
  notes?: string;
  /** Sales vs Purchase color scheme. Defaults to 'sales' — every existing caller keeps its current look unchanged. */
  kind?: 'sales' | 'purchase';
}

/** Client-side only, same approach as the Anura reference — no server-side PDF generation or storage. */
export function downloadDocumentPdf(doc: PdfDocument) {
  const pdf = new jsPDF();
  const accent = PDF_KIND_COLORS[doc.kind ?? 'sales'];

  pdf.setTextColor(...accent);
  pdf.setFontSize(18);
  pdf.text(doc.garageName ?? 'Garage', 14, 18);
  pdf.setFontSize(12);
  pdf.text(`${doc.title} ${doc.number}`, 14, 26);
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(10);
  pdf.text(`Date: ${formatDate(doc.date)}`, 14, 33);

  pdf.text(`Customer: ${doc.customerName ?? '—'}`, 14, 43);
  let tableStartY = 56;
  if (doc.vehicle) {
    pdf.text(`Vehicle: ${doc.vehicle}${doc.plate ? ` (${doc.plate})` : ''}`, 14, 49);
  } else {
    tableStartY = 49;
  }

  autoTable(pdf, {
    startY: tableStartY,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: doc.items.map((i) => [i.description, String(i.quantity), formatCurrency(i.unitPrice), formatCurrency(i.quantity * i.unitPrice)]),
    headStyles: { fillColor: accent },
  });

  const afterTableY = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  let y = afterTableY;
  const totalsLines = [
    ['Subtotal', formatCurrency(doc.subtotal)],
    ...(doc.discountAmount && doc.discountAmount > 0
      ? [[`Discount (${doc.discountPct}%)`, `-${formatCurrency(doc.discountAmount)}`]]
      : []),
    ['Tax', formatCurrency(doc.taxAmount)],
    ['Total', formatCurrency(doc.total)],
    ...(doc.extraLines ?? []).map((l) => [l.label, l.value]),
  ];
  for (const [label, value] of totalsLines) {
    pdf.text(`${label}:`, 140, y);
    pdf.text(value, 196, y, { align: 'right' });
    y += 6;
  }

  if (doc.notes) {
    y += 6;
    pdf.setFontSize(9);
    pdf.text('Notes:', 14, y);
    pdf.text(doc.notes, 14, y + 5, { maxWidth: 180 });
  }

  pdf.save(`${doc.number}.pdf`);
}

export interface PayslipDocument {
  garageName?: string;
  technicianName: string;
  periodStart: string;
  periodEnd: string;
  hourlyRate?: number;
  hoursWorked: number;
  grossPay: number;
}

/**
 * A payslip has no vehicle/customer/line-items shape, unlike Quotations and
 * Invoices — forcing it into PdfDocument above would be awkward, so this is
 * a distinct small layout reusing the same jsPDF/autoTable imports.
 */
export function downloadPayslipPdf(doc: PayslipDocument) {
  const pdf = new jsPDF();

  pdf.setFontSize(18);
  pdf.text(doc.garageName ?? 'Garage', 14, 18);
  pdf.setFontSize(12);
  pdf.text('Payslip', 14, 26);
  pdf.setFontSize(10);
  pdf.text(`Technician: ${doc.technicianName}`, 14, 36);
  pdf.text(`Period: ${formatDate(doc.periodStart)} – ${formatDate(doc.periodEnd)}`, 14, 42);

  autoTable(pdf, {
    startY: 50,
    head: [['Hourly Rate', 'Hours Worked', 'Gross Pay']],
    body: [[doc.hourlyRate != null ? formatCurrency(doc.hourlyRate) : '—', String(doc.hoursWorked), formatCurrency(doc.grossPay)]],
  });

  pdf.save(`payslip-${doc.technicianName.replace(/\s+/g, '-').toLowerCase()}-${doc.periodStart}.pdf`);
}
