import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Part } from '../types/part';
import { formatCurrency } from './utils';

const COLS = 3;
const ROWS = 8;
const MARGIN = 10;
const LABEL_W = (210 - MARGIN * 2) / COLS; // A4 width in mm
const LABEL_H = (297 - MARGIN * 2) / ROWS; // A4 height in mm
const QR_SIZE = 22;

/**
 * Client-side only, same "no server-side generation or storage" approach as
 * src/lib/pdf.ts. Each label encodes the part's barcode (falling back to
 * its SKU, then its id) as a real scannable QR code — not a 1D barcode
 * (Code128 etc. needs a proper encoding table to produce something that
 * actually scans; QR has no such risk and any modern scanner reads it).
 */
export async function downloadStockLabelsPdf(parts: Part[]) {
  const pdf = new jsPDF();
  const qrDataUrls = await Promise.all(
    parts.map((p) => QRCode.toDataURL(p.barcode || p.sku || p.id, { margin: 0, width: 200 }))
  );

  parts.forEach((part, i) => {
    const perPage = COLS * ROWS;
    const indexOnPage = i % perPage;
    if (indexOnPage === 0 && i > 0) pdf.addPage();
    const col = indexOnPage % COLS;
    const row = Math.floor(indexOnPage / COLS);
    const x = MARGIN + col * LABEL_W;
    const y = MARGIN + row * LABEL_H;

    pdf.setDrawColor(210);
    pdf.rect(x + 1, y + 1, LABEL_W - 2, LABEL_H - 2);
    pdf.addImage(qrDataUrls[i], 'PNG', x + 3, y + 3, QR_SIZE, QR_SIZE);

    const textX = x + QR_SIZE + 6;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    const nameLines = pdf.splitTextToSize(part.name, LABEL_W - QR_SIZE - 9);
    pdf.text(nameLines.slice(0, 2), textX, y + 8);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text(part.sku || part.barcode || '', textX, y + 8 + nameLines.slice(0, 2).length * 3.2 + 2);
    pdf.text(formatCurrency(part.price), textX, y + LABEL_H - 5);
  });

  pdf.save('stock-labels.pdf');
}
