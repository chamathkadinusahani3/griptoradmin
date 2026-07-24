import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LineItem } from '../types/quotation';
import { formatCurrency, formatDate } from './utils';

export interface PdfDocument {
  title: string; // "Quotation" or "Invoice"
  number: string;
  date: string;
  garageName?: string;
  customerName?: string;
  vehicle: string;
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
}

/** Client-side only, same approach as the Anura reference — no server-side PDF generation or storage. */
export function downloadDocumentPdf(doc: PdfDocument) {
  const pdf = new jsPDF();

  pdf.setFontSize(18);
  pdf.text(doc.garageName ?? 'Garage', 14, 18);
  pdf.setFontSize(12);
  pdf.text(`${doc.title} ${doc.number}`, 14, 26);
  pdf.setFontSize(10);
  pdf.text(`Date: ${formatDate(doc.date)}`, 14, 33);

  pdf.text(`Customer: ${doc.customerName ?? '—'}`, 14, 43);
  pdf.text(`Vehicle: ${doc.vehicle}${doc.plate ? ` (${doc.plate})` : ''}`, 14, 49);

  autoTable(pdf, {
    startY: 56,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: doc.items.map((i) => [i.description, String(i.quantity), formatCurrency(i.unitPrice), formatCurrency(i.quantity * i.unitPrice)]),
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
