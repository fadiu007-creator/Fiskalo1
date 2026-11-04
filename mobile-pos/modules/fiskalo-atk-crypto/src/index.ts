import { requireNativeModule } from "expo-modules-core";

export type AtkAndroidKeyResult = {
  alias: string;
  csrPem: string;
  publicKeySha256: string;
  secureHardwareBacked: boolean;
};

export type BondedBluetoothPrinter = { name: string; address: string; bonded: boolean };

type FiskaloAtkCryptoModuleType = {
  listBondedBluetoothPrinters(): Promise<BondedBluetoothPrinter[]>;
  printBluetooth(address: string, dataBase64: string): Promise<{ printed: boolean; transport: string; bytes: number }>;
  hasKey(alias: string): Promise<boolean>;
  createVerificationNo(): Promise<string>;
  createCsr(alias: string, businessName: string, nui: string, branchId: string, posId: string): Promise<AtkAndroidKeyResult>;
  signBase64(alias: string, base64Payload: string): Promise<string>;
  matchesCertificate(alias: string, certificatePem: string): Promise<boolean>;
  deleteKey(alias: string): Promise<boolean>;
  requestBluetoothPermission(): Promise<boolean>;
  listBluetoothPrinters(): Promise<Array<{ name: string; address: string }>>;
  printBluetooth(address: string, dataBase64: string): Promise<{ printed: boolean; transport: string }>;
  listUsbPrinters(): Promise<Array<{ deviceId: number; deviceName: string; manufacturerName: string; productName: string; vendorId: number; productId: number; hasPermission: boolean }>>;
  requestUsbPermission(deviceId: number): Promise<{ permissionGranted: boolean; permissionDialogRequested: boolean }>;
  printUsb(deviceId: number, dataBase64: string): Promise<{ printed: boolean; transport: string }>;
  printNetwork(host: string, port: number, dataBase64: string): Promise<{ printed: boolean; transport: string }>;
};

export default requireNativeModule<FiskaloAtkCryptoModuleType>("FiskaloAtkCrypto");
