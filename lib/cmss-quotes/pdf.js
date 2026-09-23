import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { CONTACT, TERMS, money } from "./quote.js";

function clean(value) { return String(value || "").replace(/[\r\n\t]/g, " ").replace(/[–—]/g, "-"); }

export async function renderQuotePdf(quote) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${quote.number} - CM School Supply quote`);
  doc.setAuthor("CM School Supply");
  doc.setCreationDate(new Date(quote.createdAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.035, 0.165, 0.34), muted = rgb(0.32, 0.38, 0.44), red = rgb(0.70, 0.13, 0.19), rule = rgb(0.85, 0.88, 0.91);
  let page, y;
  const draw = (value, x, yy, size = 10, font = regular, color = navy) => page.drawText(clean(value), { x, y: yy, size, font, color });
  const right = (value, x, yy, size = 10, font = regular) => draw(value, x - font.widthOfTextAtSize(clean(value), size), yy, size, font);
  const wrap = (value, width, size = 10, font = regular) => {
    const lines = []; let current = "";
    for (const character of clean(value)) { font.encodeText(character); const next = current + character; if (current && font.widthOfTextAtSize(next, size) > width) { lines.push(current); current = character; } else current = next; }
    if (current) lines.push(current); return lines;
  };
  const newPage = () => { page = doc.addPage([612, 792]); draw("CM School Supply", 44, 742, 22, bold); draw("QUOTE ESTIMATE", 44, 720, 10, bold, red); page.drawLine({ start: { x: 44, y: 707 }, end: { x: 568, y: 707 }, thickness: 2, color: red }); y = 682; };
  const ensure = (height) => { if (y - height < 80) newPage(); };
  const paragraph = (value, size = 10, font = regular, color = navy) => { for (const line of wrap(value, 524, size, font)) { ensure(size + 5); draw(line, 44, y, size, font, color); y -= size + 5; } };
  const heading = () => { page.drawRectangle({ x: 44, y: y - 7, width: 524, height: 24, color: rgb(0.94, 0.96, 0.98) }); draw("PRODUCT / ITEM NUMBER", 52, y, 9, bold); right("QTY", 410, y, 9, bold); right("UNIT", 480, y, 9, bold); right("AMOUNT", 560, y, 9, bold); y -= 32; };

  newPage(); paragraph(quote.number, 11, bold); paragraph(quote.createdAt.slice(0, 10), 10, regular, muted); y -= 10;
  paragraph(`Prepared for ${quote.contact.name}`, 12, bold); if (quote.contact.company) paragraph(quote.contact.company); paragraph(quote.contact.email, 10, regular, muted); y -= 20; heading();
  for (const item of quote.items) {
    const details = [item.title, item.variant, item.sku ? `Item # ${item.sku}` : "", ...(item.properties || []).map((property) => `${property.key}: ${property.value}`)].filter(Boolean);
    const rows = details.flatMap((value, index) => wrap(value, 322, index ? 9 : 10).map((text) => ({ text, size: index ? 9 : 10, color: index ? muted : navy })));
    if (y - rows.length * 14 - 24 < 80) { newPage(); heading(); }
    right(String(item.quantity), 410, y); right(money(item.unitCents), 480, y); right(money(item.totalCents), 560, y, 10, bold);
    for (const row of rows) { if (y < 92) { newPage(); heading(); } draw(row.text, 52, y, row.size, regular, row.color); y -= 14; }
    y -= 6; page.drawLine({ start: { x: 44, y }, end: { x: 568, y }, thickness: 0.5, color: rule }); y -= 22;
  }
  ensure(155); draw("Estimated merchandise subtotal", 44, y, 12, bold); right(money(quote.subtotalCents), 560, y, 16, bold); y -= 26;
  if (quote.discountCodes?.length) paragraph(`Applied discount: ${quote.discountCodes.join(", ")}`, 9, regular, muted);
  y -= 9; paragraph(TERMS, 9, regular, muted); y -= 13; paragraph(`Questions or changes? Reply to ${CONTACT} with your quote number.`);
  const pages = doc.getPages(); pages.forEach((current, index) => { current.drawLine({ start: { x: 44, y: 48 }, end: { x: 568, y: 48 }, thickness: 0.5, color: rule }); current.drawText(`shopcmss.com | ${CONTACT}`, { x: 44, y: 32, size: 8, font: regular, color: muted }); current.drawText(`${index + 1} / ${pages.length}`, { x: 540, y: 32, size: 8, font: regular, color: muted }); });
  return doc.save();
}
