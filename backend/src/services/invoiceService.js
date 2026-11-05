import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const INK = '#111111';
const MUTED = '#6b6357';
const RULE = '#ded5c4';
const PAPER = '#fffdf8';
const ACCENT = '#c93d1b';
const GREEN = '#1f7a4d';
const MINT = '#e7f3eb';

const ASSETS_DIR = fileURLToPath(new URL('../../assets/', import.meta.url));
let signaturePathCache;

function getSignaturePath() {
  if (signaturePathCache === undefined) {
    const candidate = path.join(ASSETS_DIR, 'signature.png');
    try {
      signaturePathCache = fs.existsSync(candidate) ? candidate : null;
    } catch {
      signaturePathCache = null;
    }
  }
  return signaturePathCache;
}

function formatCurrency(value, currency = 'INR') {
  const amount = Number(value ?? 0);
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
    .format(Number.isFinite(amount) ? amount : 0);
  return `${currency} ${formatted}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'To be confirmed';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function clean(value, fallback = '—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function paymentBadge(totalCost, amountPaid) {
  const total = Number(totalCost ?? 0);
  const paid = Number(amountPaid ?? 0);
  if (total > 0 && paid >= total) return 'FULLY PAID';
  if (paid > 0) return 'PARTIALLY PAID';
  return 'PAYMENT PENDING';
}

export function createSignatureHash(data = {}) {
  const material = `${data.invoiceNumber ?? ''}:${data.clientEmail ?? ''}:${data.totalCost ?? ''}`;
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 16).toUpperCase();
}

const TERMS = [
  {
    title: '1. 24-Hour Pre-Kickoff Cancellation',
    body: [
      'Cancellations requested within 24 hours prior to development kickoff are eligible for an 80% refund (20% retained for scoping and gateway fees).',
    ],
  },
  {
    title: '2. Non-Refundable Advance',
    body: [
      'Once architecture, UI wireframing, or coding starts, the 40% advance is strictly non-refundable.',
    ],
  },
  {
    title: '3. IP & Code Ownership',
    body: [
      'Source code and deployment rights remain the property of Group of SINGH Paradox until 100% invoice settlement.',
    ],
  },
  {
    title: '4. Scope Lock',
    body: [
      'Covers the SOW features listed above plus up to 2 minor revision rounds. Additional features require a separate change-order estimate.',
    ],
  },
];

export function generateInvoicePDF(data = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, right: 38, bottom: 34, left: 38 },
        bufferPages: true,
        compress: true,
        info: {
          Title: `Invoice ${clean(data.invoiceNumber, '')} — Group of SINGH Paradox`,
          Author: 'Group of SINGH Paradox',
          Subject: 'Official Tax Invoice & Statement of Work',
        },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;
      const right = left + width;
      const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 16;

      const features = Array.isArray(data.features)
        ? data.features.map((item) => String(item).trim()).filter(Boolean)
        : [];
      const totalCost = Number(data.totalCost ?? 0);
      const amountPaid = Number(data.amountPaid ?? 0);
      const balance = Math.max(totalCost - amountPaid, 0);
      const currency = clean(data.currency, 'INR');
      const invoiceNumber = clean(data.invoiceNumber, 'NOT ASSIGNED');
      const issueDate = formatDate(data.invoiceDate);
      const badge = paymentBadge(totalCost, amountPaid);
      const signatureHash = createSignatureHash({ ...data, totalCost });
      const signedAt = new Date().toISOString();

      const ensureSpace = (needed) => {
        if (doc.y + needed > bottomLimit()) {
          doc.addPage();
          doc.y = doc.page.margins.top;
        }
      };

      const sectionTitle = (title) => {
        doc        .font('Helvetica-Bold').fontSize(7).fillColor(ACCENT)
          .text(title.toUpperCase(), left, doc.y, { characterSpacing: 1 });
        doc.moveTo(left, doc.y + 3).lineTo(right, doc.y + 3).strokeColor(RULE).lineWidth(0.6).stroke();
        doc.y += 9;
      };

      doc.rect(0, 0, doc.page.width, 7).fill(ACCENT);

      const badgeWidth = 162;
      const badgeX = right - badgeWidth;
      doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
        .text('GROUP OF SINGH PARADOX', left, 30, { width: width - badgeWidth - 16 });
      doc.font('Helvetica').fontSize(6.8).fillColor(MUTED)
        .text('Full-Stack Software Engineering, AI Systems & Digital Architecture | rshivam.dev', left, 53, {
          width: width - badgeWidth - 16,
        });

      doc.roundedRect(badgeX, 27, badgeWidth, 58, 4).fillAndStroke(PAPER, RULE);
      doc.font('Helvetica-Bold').fontSize(6.4).fillColor(ACCENT)
        .text('OFFICIAL TAX INVOICE & SOW', badgeX + 8, 32, { width: badgeWidth - 16, characterSpacing: 0.4 });
      doc.font('Helvetica-Bold').fontSize(7.2).fillColor(INK)
        .text(`Invoice #: ${invoiceNumber}`, badgeX + 8, 42, { width: badgeWidth - 16 });
      doc.font('Helvetica').fontSize(6.2).fillColor(MUTED)
        .text(`Issue Date: ${issueDate}`, badgeX + 8, 52, { width: badgeWidth - 16 });
      doc.roundedRect(badgeX + 8, 63, badgeWidth - 16, 14, 3).fill(badge === 'FULLY PAID' ? MINT : '#fdf1ec');
      doc.font('Helvetica-Bold').fontSize(6)
        .fillColor(badge === 'FULLY PAID' ? GREEN : ACCENT)
        .text(badge, badgeX + 8, 67, { width: badgeWidth - 16, align: 'center', characterSpacing: 0.8 });

      doc.y = 92;
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(INK).lineWidth(0.9).stroke();
      doc.y += 10;

      const billWidth = width * 0.56;
      const billTop = doc.y;
      doc.font('Helvetica-Bold').fontSize(6.4).fillColor(MUTED).text('BILL TO', left, billTop, { characterSpacing: 0.8 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(clean(data.clientName), left, billTop + 9, { width: billWidth });
      doc.font('Helvetica').fontSize(7.4).fillColor(MUTED).text(clean(data.clientEmail), left, billTop + 22, { width: billWidth });

      doc.font('Helvetica-Bold').fontSize(6.4).fillColor(MUTED)
        .text('UTR / TRANSACTION ID', left + width * 0.62, billTop, { width: width * 0.38, characterSpacing: 0.8 });
      doc.font('Helvetica-Bold').fontSize(8.6).fillColor(INK)
        .text(clean(data.transactionRef, 'Not provided'), left + width * 0.62, billTop + 9, { width: width * 0.38 });

      doc.y = billTop + 32;
      sectionTitle('Project specifications');
      doc.font('Helvetica-Bold').fontSize(9.4).fillColor(INK)
        .text(clean(data.projectTitle ?? data.serviceName, clean(data.projectType, 'Engagement')), left, doc.y, { width });
      doc.y += 13;

      const specColumns = [left, left + width * 0.38, left + width * 0.66];
      const specLabels = ['PROJECT TYPE', 'ESTIMATED TIMELINE', 'TARGET DELIVERY'];
      const days = Number(data.estimatedDays);
      const specValues = [
        clean(data.projectType),
        Number.isFinite(days) && days > 0 ? `${days} Business Days` : 'To be agreed',
        formatDate(data.deliveryDate),
      ];
      specLabels.forEach((label, index) => {
        doc.font('Helvetica-Bold').fontSize(6.2).fillColor(MUTED).text(label, specColumns[index], doc.y, { width: width * 0.3, characterSpacing: 0.6 });
      });
      const specValueY = doc.y + 9;
      specValues.forEach((value, index) => {
        doc.font('Helvetica-Bold').fontSize(8.2).fillColor(INK).text(value, specColumns[index], specValueY, { width: width * 0.3 });
      });
      doc.y = specValueY + 13;

      sectionTitle('Included features & modules');
      if (features.length === 0) {
        doc.font('Helvetica-Oblique').fontSize(7.4).fillColor(MUTED).text('No feature modules were selected for this engagement.', left, doc.y);
        doc.y += 12;
      } else {
        const columnWidth = width / 2;
        const columnCount = features.length > 1 ? 2 : 1;
        const rows = Math.ceil(features.length / columnCount);
        for (let row = 0; row < rows; row += 1) {
          const rowStartY = doc.y;
          let rowHeight = 0;
          for (let column = 0; column < columnCount; column += 1) {
            const feature = features[row + column * rows];
            if (!feature) continue;
            const x = left + column * columnWidth;
            doc.circle(x + 4, rowStartY + 3.4, 4).fill(MINT);
            doc.moveTo(x + 1.9, rowStartY + 3.4).lineTo(x + 3.4, rowStartY + 5).lineTo(x + 6.3, rowStartY + 1.2)
              .strokeColor(GREEN).lineWidth(1).lineCap('round').lineJoin('round').stroke();
            doc.font('Helvetica').fontSize(6.9).fillColor(INK)
              .text(feature, x + 13, rowStartY, { width: columnWidth - 20 });
            rowHeight = Math.max(rowHeight, doc.heightOfString(feature, { width: columnWidth - 20, font: 'Helvetica', fontSize: 6.9 }));
          }
          doc.y = rowStartY + Math.max(10, rowHeight + 2);
        }
        doc.y += 3;
      }

      ensureSpace(84);
      sectionTitle('Financial breakdown');
      const rows = [
        ['Total Contract Valuation (100%)', formatCurrency(totalCost, currency), false],
        ['Advance Paid (Min 40% Kickoff Allocation)', `- ${formatCurrency(amountPaid, currency)}`, true],
        ['Balance Due on Delivery', formatCurrency(balance, currency), false],
      ];
      const rowHeight = 17;
      rows.forEach(([label, value, credited], index) => {
        const rowY = doc.y;
        if (index % 2 === 0) doc.rect(left, rowY - 3, width, rowHeight).fill(PAPER);
        doc.font(index === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .fillColor(INK).text(label, left + 6, rowY + 2, { width: width * 0.66 });
        doc.font(index === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .fillColor(credited ? GREEN : INK)
          .text(value, right - 130, rowY + 2, { width: 124, align: 'right' });
        doc.moveTo(left, rowY + rowHeight - 4).lineTo(right, rowY + rowHeight - 4).strokeColor(RULE).lineWidth(0.4).stroke();
        doc.y = rowY + rowHeight;
      });

      ensureSpace(124);
      doc.y += 3;
      sectionTitle('Terms, conditions & refund policy');
      // [BOXED LEGAL BLOCK] Poore terms ek bordered box me render hote hain (inset text, clean border).
      const termsTop = doc.y - 1;
      const termInset = 8;
      const termWidth = width - termInset * 2;
      TERMS.forEach((clause) => {
        ensureSpace(20);
        doc.font('Helvetica-Bold').fontSize(6.4).fillColor(INK)
          .text(clause.title, left + termInset, doc.y, { width: termWidth });
        doc.y += 0.6;
        clause.body.forEach((line) => {
          doc.font('Helvetica').fontSize(5.7).fillColor(MUTED)
            .text(line, left + termInset, doc.y, { width: termWidth, lineGap: 0.15 });
          doc.y += 0.4;
        });
        doc.y += 1.2;
      });
      const termsBottom = doc.y + 2;
      doc.roundedRect(left, termsTop, width, termsBottom - termsTop, 4).strokeColor(RULE).lineWidth(0.6).stroke();
      doc.y = termsBottom + 6;

      ensureSpace(96);
      doc.y += 3;
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(RULE).lineWidth(0.6).stroke();
      doc.y += 8;

      const signatureX = right - 214;
      const signatureWidth = 214;
      const signatureTop = doc.y;
      const signatureImage = getSignaturePath();
      let signatureCursor = signatureTop;

      if (signatureImage) {
        try {
          doc.image(signatureImage, signatureX, signatureCursor, { fit: [104, 28] });
          signatureCursor += 30;
        } catch {
          signatureCursor += 0;
        }
      }

      doc.font('Helvetica-Oblique').fontSize(13.5).fillColor(INK)
        .text('Shivam Singh', signatureX, signatureCursor, { width: signatureWidth });
      signatureCursor += 17;
      doc.moveTo(signatureX, signatureCursor).lineTo(signatureX + signatureWidth, signatureCursor)
        .strokeColor(INK).lineWidth(0.7).stroke();
      signatureCursor += 4;

      doc.font('Helvetica').fontSize(6.4).fillColor(MUTED)
        .text('Authorized Signatory — Group of SINGH Paradox', signatureX, signatureCursor, { width: signatureWidth });
      signatureCursor += 12;

      doc.roundedRect(signatureX, signatureCursor, 124, 12, 3).fill(MINT);
      doc.font('Helvetica-Bold').fontSize(5.6).fillColor(GREEN)
        .text('[ DIGITALLY SIGNED & VERIFIED ]', signatureX, signatureCursor + 3.4, { width: 124, align: 'center', characterSpacing: 0.3 });
      signatureCursor += 15;

      doc.font('Helvetica').fontSize(5).fillColor(MUTED)
        .text(`Digital Sign Hash: ${signatureHash} | Timestamp: ${signedAt}`, signatureX, signatureCursor, {
          width: signatureWidth,
          lineGap: 0.4,
        });

      const signatureBlockHeight = signatureCursor - signatureTop + 14;
      doc.y = Math.max(doc.y, signatureTop + signatureBlockHeight);

      const rendered = doc.bufferedPageRange();
      for (let pageIndex = 0; pageIndex < rendered.count; pageIndex += 1) {
        doc.switchToPage(rendered.start + pageIndex);
        doc.font('Helvetica').fontSize(6).fillColor(MUTED).text(
          `Group of SINGH Paradox · rshivam.dev · Invoice ${invoiceNumber} · Page ${pageIndex + 1} of ${rendered.count}`,
          left,
          doc.page.height - 42,
          { width, align: 'center', lineBreak: false }
        );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export default { generateInvoicePDF, createSignatureHash };
