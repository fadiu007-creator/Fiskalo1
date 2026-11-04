import React, { useEffect, useState } from "react";
import { Platform, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import FiskaloAtkCrypto, { type BondedBluetoothPrinter, type UsbPrinter } from "fiskalo-atk-crypto";

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
  const text = "FISKALO - TEST PRINT\nAndroid POS printer\nQR command test\n";
  out.push(...Array.from(text).map((char) => char.charCodeAt(0)));
  const qr = Array.from("FISKALO-PRINTER-TEST").map((char) => char.charCodeAt(0));
  out.push(0x1d,0x28,0x6b,0x04,0x00,0x31,0x41,0x32,0x00);
  out.push(0x1d,0x28,0x6b,0x03,0x00,0x31,0x43,0x06);
  out.push(0x1d,0x28,0x6b,0x03,0x00,0x31,0x45,0x31);
  const length = qr.length + 3;
  out.push(0x1d,0x28,0x6b,length & 255,(length >> 8) & 255,0x31,0x50,0x30,...qr);
  out.push(0x1d,0x28,0x6b,0x03,0x00,0x31,0x51,0x30,0x0a,0x0a,0x1b,0x61,0x00);
  const footer = "Test only - not a fiscal receipt\n\n\n";
  out.push(...Array.from(footer).map((char) => char.charCodeAt(0)),0x1d,0x56,0x00);
  return out;
}

export function PrinterPanel() {
  const [printers, setPrinters] = useState<BondedBluetoothPrinter[]>([]);
  const [selected, setSelected] = useState("");
  const [usbPrinters, setUsbPrinters] = useState<UsbPrinter[]>([]);
  const [selectedUsb, setSelectedUsb] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [autoPrint, setAutoPrint] = useState(false);
  const [paperWidth, setPaperWidth] = useState<"58" | "80">("80");
  const [networkHost, setNetworkHost] = useState("");

  useEffect(() => {
    void SecureStore.getItemAsync("fiskalo-printer-android-auto").then((value) => setAutoPrint(value === "true"));
    void SecureStore.getItemAsync("fiskalo-printer-android-width").then((value) => setPaperWidth(value === "58" ? "58" : "80"));
    void SecureStore.getItemAsync("fiskalo-printer-android-host").then((value) => setNetworkHost(value || ""));
    void SecureStore.getItemAsync("fiskalo-printer-android-device").then((value) => {
      if (value) setSelectedUsb(value);
    });
  }, []);

  async function loadBluetoothPrinters() {
    setBusy(true); setMessage("");
    try {
      if (Platform.OS !== "android") throw new Error("Printeri Bluetooth është i disponueshëm në aplikacionin Android.");
      const granted = await FiskaloAtkCrypto.requestBluetoothPermission();
      if (!granted) { setMessage("Lejo Nearby devices në dritaren e Android-it, pastaj rifresko printerët."); return; }
      const result = await FiskaloAtkCrypto.listBluetoothPrinters();
      setPrinters(result);
      if (result.length && !result.some((item) => item.address === selected)) setSelected(result[0].address);
      setMessage(result.length ? "U gjetën " + result.length + " printerë të çiftuar." : "Nuk u gjet printer i çiftuar. Çiftoje në cilësimet Bluetooth të Android-it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nuk u lexuan printerët Bluetooth.");
    } finally { setBusy(false); }
  }

  async function loadUsbPrinters() {
    setBusy(true); setMessage("");
    try {
      const result = await FiskaloAtkCrypto.listUsbPrinters();
      setUsbPrinters(result);
      if (result.length && !result.some((item) => String(item.deviceId) === selectedUsb)) setSelectedUsb(String(result[0].deviceId));
      setMessage(result.length ? "U gjetën " + result.length + " pajisje USB." : "Nuk u gjet printer USB. Lidhe me kabllo OTG dhe rifresko.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nuk u lexuan pajisjet USB.");
    } finally { setBusy(false); }
  }

  async function requestUsbAccess() {
    setBusy(true); setMessage("");
    try {
      if (!selectedUsb) throw new Error("Zgjidh një pajisje USB.");
      const result = await FiskaloAtkCrypto.requestUsbPermission(Number(selectedUsb));
      setMessage(result.permissionGranted ? "Leja USB është aktive." : "Konfirmo lejen USB në dritaren e Android-it, pastaj shtyp Gjej printerët USB për rifreskim.");
      setUsbPrinters(await FiskaloAtkCrypto.listUsbPrinters());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nuk u kërkua leja USB.");
    } finally { setBusy(false); }
  }

  async function testNetworkPrint() {
    setBusy(true); setMessage("");
    try {
      if (!networkHost.trim()) throw new Error("Vendos IP-në private të printerit.");
      await SecureStore.setItemAsync("fiskalo-printer-android-transport", "lan");
      await SecureStore.setItemAsync("fiskalo-printer-android-host", networkHost.trim());
      const result = await FiskaloAtkCrypto.printNetwork(networkHost.trim(), 9100, base64(buildPrinterTest()));
      setMessage(result.printed ? "Test-printimi LAN u dërgua. Kontrollo tekstin dhe QR-në." : "Printeri nuk konfirmoi printimin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test-printimi LAN dështoi.");
    } finally { setBusy(false); }
  }

  async function testBluetoothPrint() {
    setBusy(true); setMessage("");
    try {
      if (!selected) throw new Error("Zgjidh një printer Bluetooth.");
      const granted = await FiskaloAtkCrypto.requestBluetoothPermission();
      if (!granted) throw new Error("Lejo Nearby devices në Android dhe provo përsëri.");
      const result = await FiskaloAtkCrypto.printBluetooth(selected, base64(buildPrinterTest()));
      setMessage(result.printed ? "Test-printimi Bluetooth u dërgua. Kontrollo tekstin dhe QR-në; nuk është kupon fiskal." : "Printeri nuk konfirmoi printimin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test-printimi Bluetooth dështoi.");
    } finally { setBusy(false); }
  }

  async function testUsbPrint() {
    setBusy(true); setMessage("");
    try {
      if (!selectedUsb) throw new Error("Zgjidh një printer USB.");
      const result = await FiskaloAtkCrypto.printUsb(Number(selectedUsb), base64(buildPrinterTest()));
      setMessage(result.printed ? "Test-printimi USB u dërgua. Kontrollo tekstin dhe QR-në; nuk është kupon fiskal." : "Printeri nuk konfirmoi printimin.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test-printimi USB dështoi.");
    } finally { setBusy(false); }
  }

  return <View style={{ padding: 12, marginBottom: 9, backgroundColor: "white", borderWidth: 1, borderColor: border, borderRadius: 9, gap: 8 }}>
    <Text style={{ color: ink, fontWeight: "800" }}>Printer termik · Android</Text>
    <Text style={{ color: "#687773", fontSize: 11 }}>Bluetooth Classic (SPP) dhe USB OTG për printerë ESC/POS. Për USB, lidhe printerin me kabllo OTG dhe jep lejen e Android-it.</Text>
    <TouchableOpacity disabled={busy} onPress={() => void loadBluetoothPrinters()} style={{ padding: 11, borderRadius: 8, backgroundColor: brand, opacity: busy ? 0.55 : 1 }}>
      <Text style={{ color: "white", textAlign: "center", fontWeight: "800" }}>{busy ? "Duke kontrolluar..." : "Gjej printerët Bluetooth"}</Text>
    </TouchableOpacity>
    {printers.map((printer) => <TouchableOpacity key={printer.address} onPress={() => { setSelected(printer.address); void SecureStore.setItemAsync("fiskalo-printer-android-transport", "bluetooth"); void SecureStore.setItemAsync("fiskalo-printer-android-device", printer.address); }} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: selected === printer.address ? brand : border, backgroundColor: selected === printer.address ? "#edf5f1" : "white" }}>
      <Text style={{ color: ink, fontWeight: "700" }}>{selected === printer.address ? "● " : "○ "}{printer.name}</Text>
      <Text style={{ color: "#687773", fontSize: 11 }}>{printer.address}</Text>
    </TouchableOpacity>)}
    <TouchableOpacity disabled={busy || !selected} onPress={() => void testBluetoothPrint()} style={{ padding: 11, borderRadius: 8, borderWidth: 1, borderColor: border, opacity: busy || !selected ? 0.5 : 1 }}>
      <Text style={{ color: ink, textAlign: "center", fontWeight: "800" }}>Printo testin Bluetooth (tekst + QR)</Text>
    </TouchableOpacity>
    <View style={{ borderTopWidth: 1, borderColor: border, paddingTop: 8, gap: 7 }}>
      <Text style={{ color: ink, fontWeight: "700" }}>USB OTG</Text>
      <TouchableOpacity disabled={busy} onPress={() => void loadUsbPrinters()} style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: border, opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: ink, textAlign: "center", fontWeight: "700" }}>Gjej printerët USB</Text>
      </TouchableOpacity>
      {usbPrinters.map((printer) => <TouchableOpacity key={printer.deviceId} onPress={() => { setSelectedUsb(String(printer.deviceId)); void SecureStore.setItemAsync("fiskalo-printer-android-transport", "usb"); void SecureStore.setItemAsync("fiskalo-printer-android-device", String(printer.deviceId)); }} style={{ padding: 9, borderRadius: 8, borderWidth: 1, borderColor: selectedUsb === String(printer.deviceId) ? brand : border, backgroundColor: selectedUsb === String(printer.deviceId) ? "#edf5f1" : "white" }}>
        <Text style={{ color: ink, fontWeight: "700" }}>{selectedUsb === String(printer.deviceId) ? "● " : "○ "}{printer.productName}</Text>
        <Text style={{ color: "#687773", fontSize: 10 }}>{printer.manufacturerName} · VID {printer.vendorId} / PID {printer.productId} · {printer.hasPermission ? "Leja aktive" : "Kërkon leje"}</Text>
      </TouchableOpacity>)}
      {!!selectedUsb && <View style={{ flexDirection: "row", gap: 7 }}>
        <TouchableOpacity disabled={busy} onPress={() => void requestUsbAccess()} style={{ flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: border }}>
          <Text style={{ color: ink, textAlign: "center", fontWeight: "700" }}>Lejo USB</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy || !usbPrinters.find((item) => String(item.deviceId) === selectedUsb)?.hasPermission} onPress={() => void testUsbPrint()} style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: brand, opacity: busy || !usbPrinters.find((item) => String(item.deviceId) === selectedUsb)?.hasPermission ? 0.5 : 1 }}>
          <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>Testo USB</Text>
        </TouchableOpacity>
      </View>}
    </View>
    <View style={{ borderTopWidth: 1, borderColor: border, paddingTop: 8, gap: 7 }}>
      <Text style={{ color: ink, fontWeight: "700" }}>Printer në rrjet (LAN)</Text>
      <TextInput value={networkHost} onChangeText={setNetworkHost} onBlur={() => { void SecureStore.setItemAsync("fiskalo-printer-android-host", networkHost.trim()); }} placeholder="IP private, p.sh. 192.168.1.50" keyboardType="numeric" autoCapitalize="none" style={{ borderWidth: 1, borderColor: border, borderRadius: 8, padding: 10, color: ink }} />
      <TouchableOpacity disabled={busy || !networkHost.trim()} onPress={() => void testNetworkPrint()} style={{ padding: 10, borderRadius: 8, backgroundColor: brand, opacity: busy || !networkHost.trim() ? 0.5 : 1 }}>
        <Text style={{ color: "white", textAlign: "center", fontWeight: "700" }}>Testo LAN (TCP 9100)</Text>
      </TouchableOpacity>
    </View>
    <View style={{ gap: 6 }}>
      <Text style={{ color: ink, fontWeight: "700" }}>Gjerësia e letrës</Text>
      <View style={{ flexDirection: "row", gap: 7 }}>
        {(["58", "80"] as const).map((width) => <TouchableOpacity key={width} onPress={() => { setPaperWidth(width); void SecureStore.setItemAsync("fiskalo-printer-android-width", width); }} style={{ flex: 1, padding: 9, borderRadius: 8, borderWidth: 1, borderColor: paperWidth === width ? brand : border, backgroundColor: paperWidth === width ? "#edf5f1" : "white" }}>
          <Text style={{ color: ink, textAlign: "center", fontWeight: "700" }}>{width} mm</Text>
        </TouchableOpacity>)}
      </View>
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderColor: border }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ color: ink, fontWeight: "700" }}>Printim automatik pas shitjes</Text>
        <Text style={{ color: "#687773", fontSize: 10 }}>Vetëm kur Fiskalo ka QR me status të pranuar nga ATK TEST.</Text>
      </View>
      <Switch value={autoPrint} onValueChange={(value) => { setAutoPrint(value); void SecureStore.setItemAsync("fiskalo-printer-android-auto", value ? "true" : "false"); }} />
    </View>
    {!!message && <Text accessibilityRole="alert" style={{ color: "#52635e", fontSize: 11, lineHeight: 16 }}>{message}</Text>}
    <Text style={{ color: "#8a5a18", fontSize: 10 }}>Testi dërgon tekst dhe QR ESC/POS. Nuk është kupon fiskal dhe nuk certifikon pajtueshmërinë ATK. USB kërkon OTG dhe ndërfaqe bulk OUT.</Text>
  </View>;
}
