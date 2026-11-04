import FiskaloAtkCrypto from "fiskalo-atk-crypto";
import * as SecureStore from "expo-secure-store";

export type AndroidReceipt = {
  businessName: string;
  nui: string;
  municipality: string;
  invoiceNumber: string;
  issuedAt: string;
  paymentMethod: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; vatRate: number; lineTotal: number }>;
  subtotal: number;
  vatTotal: number;
  total: number;
  qrPayload?: string | null;
  fiscalStatus?: string | null;
};

function ascii(value: string): number[] {
  return Array.from(value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ëË]/g, "e").replace(/[çÇ]/g, "c").replace(/[^\x20-\x7E]/g, "?"))
    .map((char) => char.charCodeAt(0));
}

function base64(bytes: number[]): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    output += b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    output += c === undefined ? "=" : alphabet[c & 63];
  }
  return output;
}

function receiptBytes(receipt: AndroidReceipt, width: 58 | 80): number[] {
  const columns = width === 58 ? 32 : 48;
  const out: number[] = [];
  const command = (...bytes: number[]) => out.push(...bytes);
  const line = (text = "") => { out.push(...ascii(text), 0x0a); };
  const rule = () => line("-".repeat(columns));
  const money = (amount: number) => amount.toFixed(2) + " EUR";
  const pair = (left: string, right: string) => {
    const space = Math.max(1, columns - ascii(right).length - 1);
    line(ascii(left).slice(0, space).map((byte) => String.fromCharCode(byte)).join("").padEnd(space) + " " + right);
  };
  command(0x1b,0x40,0x1b,0x61,0x01,0x1b,0x45,0x01);
  line(receipt.businessName.toUpperCase());
  command(0x1b,0x45,0x00);
  if (receipt.municipality) line(receipt.municipality);
  if (receipt.nui) line("NUI: " + receipt.nui);
  rule();
  pair("FATURA", receipt.invoiceNumber);
  pair("DATA", receipt.issuedAt);
  pair("PAGESA", receipt.paymentMethod);
  rule();
  for (const item of receipt.items) {
    line(item.name);
    pair(item.quantity + " x " + money(item.unitPrice), money(item.lineTotal));
    line("TVSH " + item.vatRate + "%");
  }
  rule();
  pair("NENTOTALI", money(receipt.subtotal));
  pair("TVSH", money(receipt.vatTotal));
  command(0x1b,0x45,0x01);
  pair("TOTALI", money(receipt.total));
  command(0x1b,0x45,0x00);
  rule();
  if (receipt.qrPayload && receipt.qrPayload.length <= 2500) {
    const qr = ascii(receipt.qrPayload);
    command(0x1b,0x61,0x01,0x1d,0x28,0x6b,0x04,0x00,0x31,0x41,0x32,0x00);
    command(0x1d,0x28,0x6b,0x03,0x00,0x31,0x43,0x06);
    command(0x1d,0x28,0x6b,0x03,0x00,0x31,0x45,0x31);
    const length = qr.length + 3;
    command(0x1d,0x28,0x6b,length & 255,(length >> 8) & 255,0x31,0x50,0x30,...qr);
    command(0x1d,0x28,0x6b,0x03,0x00,0x31,0x51,0x30,0x0a);
    line("ATK TEST - SKANO PER VERIFIKIM");
  } else {
    command(0x1b,0x61,0x01);
    line("DOKUMENT I BRENDSHEM");
    line("JO KUPON FISKAL");
  }
  if (receipt.fiscalStatus) line("ATK TEST: " + receipt.fiscalStatus);
  line("JU FALEMINDERIT!");
  line(); line();
  command(0x1d,0x56,0x00);
  return out;
}

export async function printAndroidReceipt(receipt: AndroidReceipt): Promise<"disabled" | "printed"> {
  const enabled = await SecureStore.getItemAsync("fiskalo-printer-android-auto");
  if (enabled !== "true") return "disabled";
  const transport = await SecureStore.getItemAsync("fiskalo-printer-android-transport");
  const device = await SecureStore.getItemAsync("fiskalo-printer-android-device");
  const widthValue = await SecureStore.getItemAsync("fiskalo-printer-android-width");
  const width = widthValue === "58" ? 58 : 80;
  const host = await SecureStore.getItemAsync("fiskalo-printer-android-host");
  if (transport === "lan") {
    if (!host) throw new Error("Vendos IP-në private të printerit LAN.");
  } else if (!device || (transport !== "bluetooth" && transport !== "usb")) {
    throw new Error("Konfiguro printerin Android dhe zgjidh pajisjen para printimit automatik.");
  }
  if (receipt.fiscalStatus !== "accepted" || !receipt.qrPayload) {
    throw new Error("Printimi automatik u ndal: mungon QR i pranuar nga ATK TEST. Nuk u printua dokument si kupon fiskal.");
  }
  const payload = base64(receiptBytes(receipt, width));
  if (transport === "bluetooth") await FiskaloAtkCrypto.printBluetooth(device!, payload);
  else if (transport === "usb") await FiskaloAtkCrypto.printUsb(Number(device), payload);
  else await FiskaloAtkCrypto.printNetwork(host!, 9100, payload);
  return "printed";
}
