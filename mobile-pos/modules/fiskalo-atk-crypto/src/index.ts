import { requireNativeModule } from "expo-modules-core";

export type AtkAndroidKeyResult = {
  alias: string;
  csrPem: string;
  publicKeySha256: string;
  secureHardwareBacked: boolean;
};

type FiskaloAtkCryptoModuleType = {
  hasKey(alias: string): Promise<boolean>;
  createCsr(alias: string, businessName: string, nui: string, branchId: string, posId: string): Promise<AtkAndroidKeyResult>;
  signBase64(alias: string, base64Payload: string): Promise<string>;
  deleteKey(alias: string): Promise<boolean>;
};

export default requireNativeModule<FiskaloAtkCryptoModuleType>("FiskaloAtkCrypto");
