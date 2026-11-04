import React, { useState } from "react";
import { PermissionsAndroid, Platform, Text, TouchableOpacity, View } from "react-native";
import FiskaloAtkCrypto, { type BondedBluetoothPrinter } from "fiskalo-atk-crypto";

const ink = "#17212b";
const brand = "#245b50";
const border = "#dce3e1";

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

function buildPrinterTest(): number[] {
  const out: number[] = [0x1b, 0x40, 0x1b, 0x61, 0x01];
  const text = "FISKALO - TEST PRINT\nBluetooth POS printer\nQR command test\n";
  out.push(...Array.from(text).map((char) => char.charCodeAt(0)));
  const qr = Array.from("FISKALO-PRINTER-TEST").map((char) => char.charCodeAt(0));
  out.push(0x1d,0x28,0x6b,0x04,0x00,0x31,0x41,0x32,0x00);
  out.push(0x1d,0x28,0x6b,0x03,0x00,0x31,0x43,0x06);
  out.push(0x1d,0x28,0x6b,0x03,0x00,0x31,0x45,0x31);
  const length = qr.length + 3;
  out.push(0x1d,0x28,0x6b,length & 255,(length >> 8) & 255,0x31,0x50,0x30,...qr);
  out.push(0x1d,0x28,0x6b,0x03,0x00,0x31,0x51,0x30);
  out.push(0x0a,0x0a,0x1b,0x61,0x00);
  const footer = "Test only - not a fiscal receipt\n\n\n";
  out.push(...Array.from(footer).map((char) => char.charCodeAt(0)));
  out.push(0x1d,0x56,0x00);
  return out;
}

export function PrinterPanel() {
  const [printers, setPrinters] = useState<BondedBluetoothPrinter[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPrinters() {
    setBusy(true); setMessage("");
    try {
      if (Platform.OS !== "android") throw new Error("Bluetooth POS printing is available in the Android app.");
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, {
        title: "Leja për printerin Bluetooth",
        message: "Fiskalo ka nevojë të lexojë pajisjet Bluetooth të çiftuara për të dërguar kuponin në printer.",
        buttonPositive: "Lejo",
        buttonNegative: "Anulo",
      });
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("Leja Bluetooth nuk u dha.");
      const result = await FiskaloAtkCrypto.listBondedBluetoothPrinters();
      setPrinters(result);
      if (result.length && !result.some((item) => item.address === selected)) setSelected(result[0].address);
      setMessage(result.length ? "U gjetën " + result.length + " pajisje Bluetooth të çiftuara." : "Nuk u gjet printer i çiftuar. Çifto printerin te cilësimet Bluetooth të Android-it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nuk u lexuan pajisjet Bluetooth.");
    } finally { setBusy(false); }
  }

  async function testPrint() {
    setBusy(true); setMessage("");
    try {
      if (!selected) throw new Error("Zgjidh një printer Bluetooth.");
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("Leja Bluetooth nuk u dha.");
      const result = await FiskaloAtkCrypto.printBluetooth(selected, base64(buildPrinterTest()));
      setMessage(result.printed ? "Test-printimi u dërgua (" + result.bytes + " byte). Kontrollo letrën dhe QR-në. Ky nuk është kupon fiskal." : "Printeri nuk konfirmoi printimin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test-printimi dështoi.");
    } finally { setBusy(false); }
  }

  return <View style={{ padding: 12, marginBottom: 9, backgroundColor: "white", borderWidth: 1, borderColor: border, borderRadius: 9, gap: 8 }}>
    <Text style={{ color: ink, fontWeight: "800" }}>Printer termik Bluetooth · Android</Text>
    <Text style={{ color: "#687773", fontSize: 11 }}>Çiftoje printerin në cilësimet e Android-it, pastaj rifresko listën. Kërkohet printer ESC/POS me Bluetooth Classic (SPP).</Text>
    <TouchableOpacity disabled={busy} onPress={() => void loadPrinters()} style={{ padding: 11, borderRadius: 8, backgroundColor: brand, opacity: busy ? 0.55 : 1 }}>
      <Text style={{ color: "white", textAlign: "center", fontWeight: "800" }}>{busy ? "Duke kontrolluar..." : "Gjej printerët e çiftuar"}</Text>
    </TouchableOpacity>
    {printers.map((printer) => <TouchableOpacity key={printer.address} onPress={() => setSelected(printer.address)} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: selected === printer.address ? brand : border, backgroundColor: selected === printer.address ? "#edf5f1" : "white" }}>
      <Text style={{ color: ink, fontWeight: "700" }}>{selected === printer.address ? "● " : "○ "}{printer.name}</Text>
      <Text style={{ color: "#687773", fontSize: 11 }}>{printer.address}</Text>
    </TouchableOpacity>)}
    <TouchableOpacity disabled={busy || !selected} onPress={() => void testPrint()} style={{ padding: 11, borderRadius: 8, borderWidth: 1, borderColor: border, opacity: busy || !selected ? 0.5 : 1 }}>
      <Text style={{ color: ink, textAlign: "center", fontWeight: "800" }}>Printo testin (tekst + QR)</Text>
    </TouchableOpacity>
    {!!message && <Text accessibilityRole="alert" style={{ color: "#52635e", fontSize: 11, lineHeight: 16 }}>{message}</Text>}
    <Text style={{ color: "#8a5a18", fontSize: 10 }}>Testi provon lidhjen Bluetooth dhe komandën QR. Nuk verifikon përputhshmërinë zyrtare ATK dhe nuk dërgon kupon fiskal.</Text>
  </View>;
}
