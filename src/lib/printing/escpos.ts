export type ReceiptLine = { name: string; quantity: number; unitPrice: number; vatRate: number; lineTotal: number };
export type ReceiptPrintData = {
  businessName: string; nui?: string | null; fiscalNumber?: string | null; vatNumber?: string | null;
  address?: string | null; municipality?: string | null; phone?: string | null;
  invoiceNumber: string; issuedAt: string; paymentMethod: string; items: ReceiptLine[];
  subtotal: number; vatTotal: number; total: number; discountTotal?: number;
  taxGroups?: Array<{ rate: number; net: number; tax: number }>;
  unitNumber?: string | number | null; posId?: string | number | null; sefIdentifier?: string | null;
  couponId?: string | number | null; verificationNo?: string | null; couponType?: string | null;
  operatorName?: string | null; operatorId?: string | null; isTest?: boolean;
  qrPayload?: string | null; fiscalStatus?: string | null;
  paperWidthMm: 58 | 80;
};

const encoder = new TextEncoder();
const money = (value: number) => new Intl.NumberFormat("sq-XK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " EUR";
const plain = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ëË]/g, "e").replace(/[çÇ]/g, "c").replace(/[^\x20-\x7E]/g, "?");

export function buildEscPosReceipt(receipt: ReceiptPrintData): Uint8Array {
  const columns = receipt.paperWidthMm === 58 ? 32 : 48;
  const output: number[] = [];
  const bytes = (value: string) => output.push(...encoder.encode(plain(value)));
  const command = (...values: number[]) => output.push(...values);
  const line = (value = "") => { bytes(value); command(0x0a); };
  const rule = () => line("-".repeat(columns));
  const wrap = (value: string, width: number) => {
    const words = plain(value).split(/\s+/);
    const result: string[] = []; let current = "";
    for (const word of words) {
      if (!word) continue;
      if (word.length > width) {
        if (current) result.push(current);
        current = "";
        for (let i = 0; i < word.length; i += width) result.push(word.slice(i, i + width));
      } else if (!current) current = word;
      else if ((current + " " + word).length <= width) current += " " + word;
      else { result.push(current); current = word; }
    }
    if (current) result.push(current);
    return result;
  };
  const pair = (left: string, right: string) => {
    const l = plain(left); const r = plain(right);
    const available = Math.max(1, columns - r.length - 1);
    line(l.slice(0, available).padEnd(available) + " " + r);
  };
  command(0x1b, 0x40); // Initialize printer
  command(0x1b, 0x61, 0x01); // Center
  command(0x1b, 0x45, 0x01);
  line("REPUBLIKA E KOSOVES · RKS");
  line("KUPON FISKAL / E-KUPON");
  if (receipt.isTest) line("TEST ATK · JO KUPON ZYRTAR");
  line(receipt.businessName.toUpperCase());
  command(0x1b, 0x45, 0x00);
  if (receipt.address) for (const part of wrap(receipt.address, columns)) line(part);
  if (receipt.municipality) line(receipt.municipality);
  if (receipt.nui) pair("NUI / NR. FISKAL", receipt.nui);
  if (receipt.fiscalNumber && receipt.fiscalNumber !== receipt.nui) pair("NR. FISKAL", receipt.fiscalNumber);
  if (receipt.vatNumber) pair("NR. TVSH", receipt.vatNumber);
  if (receipt.phone) pair("Tel", receipt.phone);
  command(0x1b, 0x61, 0x00); // Left
  rule();
  pair("KUPONI", receipt.couponId == null ? (receipt.invoiceNumber || "-") : String(receipt.couponId));
  if (receipt.couponType) pair("LLOJI", receipt.couponType);
  pair("DATA / ORA", receipt.issuedAt);
  if (receipt.unitNumber != null) pair("NJESIA", String(receipt.unitNumber));
  if (receipt.posId != null) pair("POS ID", String(receipt.posId));
  if (receipt.sefIdentifier) pair("IDENTIFIKUESI SEF", receipt.sefIdentifier);
  if (receipt.verificationNo) pair("VERIFICATION NO", receipt.verificationNo);
  if (receipt.operatorName) pair("OPERATORI", receipt.operatorName);
  if (receipt.operatorId) pair("ID OPERATORI", receipt.operatorId);
  pair("PAGESA", receipt.paymentMethod);
  rule();
  for (const item of receipt.items) {
    for (const part of wrap(item.name, columns)) line(part);
    pair(`${item.quantity} x ${money(item.unitPrice)}`, money(item.lineTotal));
    line("TVSH " + item.vatRate + "%");
  }
  rule();
  pair("NENTOTALI", money(receipt.subtotal));
  if (receipt.taxGroups?.length) {
    line("TVSH SIPAS NORMAVE");
    for (const group of receipt.taxGroups) {
      pair("TVSH " + group.rate + "% · NETO " + money(group.net), money(group.tax));
    }
  }
  pair("TVSH TOTALE", money(receipt.vatTotal));
  if (receipt.discountTotal && receipt.discountTotal > 0) pair("ZBRITJA E APLIKUAR", "-" + money(receipt.discountTotal));
  command(0x1b, 0x45, 0x01);
  pair("TOTALI", money(receipt.total));
  command(0x1b, 0x45, 0x00);
  rule();
  if (receipt.qrPayload) {
    const qr = encoder.encode(receipt.qrPayload);
    if (qr.length > 3000) throw new Error("QR payload is too large for a reliable thermal receipt. Use the customer digital receipt.");
    command(0x1b, 0x61, 0x01);
    command(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // QR model 2
    command(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06); // module size
    command(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31); // error correction M
    const length = qr.length + 3;
    command(0x1d, 0x28, 0x6b, length & 0xff, (length >> 8) & 0xff, 0x31, 0x50, 0x30);
    output.push(...qr);
    command(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
    line();
    line("SKANO PER VERIFIKIM");
  } else {
    command(0x1b, 0x61, 0x01);
    line("DOKUMENT I BRENDSHEM");
    line("JO KUPON FISKAL");
  }
  if (receipt.fiscalStatus && receipt.fiscalStatus !== "accepted") line("ATK STATUS: " + receipt.fiscalStatus);
  if (receipt.isTest) line("KOPJE TESTIMI · NUK VLEN SI KUPON FISKAL");
  line("JU FALEMINDERIT!");
  line(); line();
  command(0x1d, 0x56, 0x00); // Full cut
  return new Uint8Array(output);
}

export function bytesToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary);
}
