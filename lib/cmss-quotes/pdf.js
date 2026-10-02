import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { CONTACT, TERMS, money } from "./quote.js";
import { CMSS_LOGO_BASE64 } from "./logo-data.js";

function clean(value) { return String(value || "").replace(/[\r\n\t]/g, " ").replace(/[\u2013\u2014]/g, "-"); }

export async function renderQuotePdf(quote) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${quote.number} - CM School Supply quote`);
  doc.setAuthor("CM School Supply");
  doc.setSubject("Customer quotation estimate");
  doc.setCreationDate(new Date(quote.createdAt));
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = Buffer.from(CMSS_LOGO_BASE64, "base64");
  const logo = await doc.embedPng(logoBytes);
  const navy = rgb(0.035, 0.165, 0.34);
  const deepNavy = rgb(0.025, 0.11, 0.24);
  const muted = rgb(0.32, 0.38, 0.44);
  const red = rgb(0.70, 0.13, 0.19);
  const rule = rgb(0.84, 0.88, 0.92);
  const pale = rgb(0.95, 0.97, 0.985);
  const white = rgb(1, 1, 1);
  let page, y;
  const draw = (value, x, yy, size = 10, font = regular, color = navy) => page.drawText(clean(value), { x, y: yy, size, font, color });
  const right = (value, x, yy, size = 10, font = regular, color = navy) => draw(value, x - font.widthOfTextAtSize(clean(value), size), yy, size, font, color);
  const wrap = (value, width, size = 10, font = regular) => {
    const words = clean(value).split(/\s+/).filter(Boolean);
    const lines = []; let current = "";
    for (const word of words) {
      font.encodeText(word);
      const next = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(next, size) > width) { lines.push(current); current = word; } else current = next;
    }
    if (current) lines.push(current);
    return lines;
  };
  const newPage = () => {
    page = doc.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 687, width: 612, height: 105, color: deepNavy });
    page.drawImage(logo, { x: 44, y: 728, width: 250, height: 50 });
    right("QUOTE ESTIMATE", 568, 751, 17, bold, white);
    right(quote.number, 568, 730, 9, bold, white);
    right("Classroom supplies, learning materials & furniture", 568, 711, 7.5, regular, rgb(0.82, 0.88, 0.94));
    page.drawRectangle({ x: 0, y: 681, width: 612, height: 6, color: red });
    y = 654;
  };
  const ensure = (height) => { if (y - height < 86) newPage(); };
  const tableHeading = () => {
    page.drawRectangle({ x: 44, y: y - 8, width: 524, height: 28, color: navy });
    draw("PRODUCT / ITEM NUMBER", 54, y, 9, bold, white);
    right("QTY", 414, y, 9, bold, white);
    right("UNIT", 486, y, 9, bold, white);
    right("AMOUNT", 558, y, 9, bold, white);
    y -= 36;
  };

  newPage();
  page.drawRectangle({ x: 44, y: y - 86, width: 524, height: 100, color: pale, borderColor: rule, borderWidth: 0.7 });
  page.drawRectangle({ x: 44, y: y - 86, width: 5, height: 100, color: red });
  draw("PREPARED FOR", 56, y, 8, bold, red);
  draw(quote.contact.name, 56, y - 21, 14, bold);
  if (quote.contact.company) draw(quote.contact.company, 56, y - 40, 10.5, bold);
  draw(quote.contact.email, 56, y - 58, 9.5, regular, muted);
  if (quote.contact.phone) draw(quote.contact.phone, 56, y - 74, 9.5, regular, muted);
  draw("QUOTE DATE", 420, y, 8, bold, muted);
  right(quote.createdAt.slice(0, 10), 556, y - 18, 10.5, bold);
  y -= 116;
  tableHeading();

  let rowIndex = 0;
  for (const item of quote.items) {
    const details = [item.title, item.variant, item.sku ? `Item # ${item.sku}` : "", ...(item.properties || []).map((property) => `${property.key}: ${property.value}`)].filter(Boolean);
    const rows = details.flatMap((value, index) => wrap(value, 306, index ? 8.5 : 10).map((text) => ({ text, size: index ? 8.5 : 10, font: index ? regular : bold, color: index ? muted : navy })));
    const rowHeight = Math.max(42, rows.length * 13 + 12);
    if (y - rowHeight < 86) { newPage(); tableHeading(); }
    if (rowIndex % 2 === 1) page.drawRectangle({ x: 44, y: y - rowHeight + 11, width: 524, height: rowHeight, color: rgb(0.985, 0.99, 0.995) });
    right(String(item.quantity), 414, y); right(money(item.unitCents), 486, y); right(money(item.totalCents), 558, y, 10, bold);
    let textY = y;
    for (const row of rows) { draw(row.text, 54, textY, row.size, row.font, row.color); textY -= 13; }
    y -= rowHeight;
    page.drawLine({ start: { x: 44, y: y + 11 }, end: { x: 568, y: y + 11 }, thickness: 0.5, color: rule });
    rowIndex += 1;
  }

  ensure(182);
  page.drawRectangle({ x: 332, y: y - 48, width: 236, height: 62, color: deepNavy });
  draw("ESTIMATED MERCHANDISE SUBTOTAL", 346, y - 8, 8, bold, rgb(0.82, 0.88, 0.94));
  right(money(quote.subtotalCents), 554, y - 34, 20, bold, white);
  if (quote.discountCodes?.length) draw(`Discount: ${quote.discountCodes.join(", ")}`, 44, y - 16, 9, regular, muted);
  y -= 82;
  page.drawRectangle({ x: 44, y: y - 62, width: 524, height: 76, color: pale, borderColor: rule, borderWidth: 0.7 });
  draw("PLEASE NOTE", 56, y - 7, 8, bold, red);
  let noteY = y - 25;
  for (const line of wrap(TERMS, 492, 8.5, regular)) { draw(line, 56, noteY, 8.5, regular, muted); noteY -= 13; }
  y -= 92;
  draw("Questions or changes?", 44, y, 10.5, bold);
  draw(`Reply to ${CONTACT} with your quote number and our team will help.`, 44, y - 17, 9.5, regular, muted);

  const pages = doc.getPages();
  pages.forEach((current, index) => {
    current.drawLine({ start: { x: 44, y: 54 }, end: { x: 568, y: 54 }, thickness: 0.7, color: rule });
    current.drawText("shopcmss.com  |  shop@cmschoolsupply.com  |  (951) 689-6400", { x: 44, y: 36, size: 8, font: regular, color: muted });
    current.drawText(`${index + 1} / ${pages.length}`, { x: 540, y: 36, size: 8, font: regular, color: muted });
  });
  return doc.save();
}
