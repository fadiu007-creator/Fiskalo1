/**
 * Browser-local P-256 key vault for the Fiskalo Web POS.
 *
 * This is a prototype/test-environment key store, not a certification claim.
 * The private CryptoKey is non-extractable and persisted in IndexedDB. Browser
 * profile storage is not equivalent to an OS/hardware keystore and can be
 * lost or exposed by a compromised browser profile or same-origin XSS.
 */
export type BrowserCsrIdentity = {
  businessName: string;
  nui: string;
  branchId: string;
  posId: string;
};

type StoredKey = {
  id: string;
  privateKey: CryptoKey;
  publicKeySpki: ArrayBuffer;
  createdAt: string;
};

const DB_NAME = "fiskalo-atk-local";
const DB_VERSION = 1;
const STORE_NAME = "pos-keys";

function requireBrowserCrypto(): Crypto {
  if (typeof window === "undefined" || !window.isSecureContext || !window.crypto?.subtle) {
    throw new Error("ATK browser key storage requires a supported browser on HTTPS or localhost.");
  }
  return window.crypto;
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local key storage."));
  });
}

async function readKey(id: string): Promise<StoredKey | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as StoredKey | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read the local POS key."));
    });
  } finally { db.close(); }
}

async function writeKey(record: StoredKey): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not save the local POS key."));
      tx.onabort = () => reject(tx.error ?? new Error("Local POS key storage was aborted."));
    });
  } finally { db.close(); }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function derLength(length: number): Uint8Array {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) { bytes.unshift(value & 255); value >>>= 8; }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, value: Uint8Array): Uint8Array {
  return concat(new Uint8Array([tag]), derLength(value.length), value);
}

function derSequence(...values: Uint8Array[]): Uint8Array { return der(0x30, concat(...values)); }
function derSet(value: Uint8Array): Uint8Array { return der(0x31, value); }
function derOid(bytes: number[]): Uint8Array { return der(0x06, new Uint8Array(bytes)); }
function derUtf8(value: string): Uint8Array { return der(0x0c, new TextEncoder().encode(value)); }
function derPrintable(value: string): Uint8Array { return der(0x13, new TextEncoder().encode(value)); }

function derInteger(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start++;
  let value = bytes.slice(start);
  if ((value[0] & 0x80) !== 0) value = concat(new Uint8Array([0]), value);
  return der(0x02, value);
}

function ecdsaRawToDer(signature: ArrayBuffer): Uint8Array {
  const raw = new Uint8Array(signature);
  if (raw.length !== 64) throw new Error("Unexpected P-256 signature length.");
  return derSequence(derInteger(raw.slice(0, 32)), derInteger(raw.slice(32, 64)));
}

function subjectName(identity: BrowserCsrIdentity): Uint8Array {
  const attributes = [
    derSequence(derOid([0x55, 0x04, 0x06]), derPrintable("RKS")),
    derSequence(derOid([0x55, 0x04, 0x0a]), derUtf8(identity.nui)),
    derSequence(derOid([0x55, 0x04, 0x0b]), derUtf8(identity.posId)),
    derSequence(derOid([0x55, 0x04, 0x07]), derUtf8(identity.branchId)),
    derSequence(derOid([0x55, 0x04, 0x03]), derUtf8(identity.businessName.trim())),
  ];
  return derSequence(...attributes.map(derSet));
}

function toPem(label: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  const lines = encoded.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function validateIdentity(identity: BrowserCsrIdentity): void {
  if (!identity.businessName.trim()) throw new Error("Business name is required.");
  for (const [label, value] of [["NUI", identity.nui], ["unit/branch ID", identity.branchId], ["POS ID", identity.posId]] as const) {
    if (!/^\d{1,20}$/.test(value)) throw new Error(`${label} must contain digits only.`);
  }
}

export async function hasBrowserPosKey(id: string): Promise<boolean> {
  return Boolean(await readKey(id));
}

export async function createBrowserPosCsr(id: string, identity: BrowserCsrIdentity): Promise<{
  csrPem: string;
  publicKeySpkiBase64: string;
  publicKeySha256: string;
  createdAt: string;
}> {
  const cryptoApi = requireBrowserCrypto();
  validateIdentity(identity);
  if (await readKey(id)) throw new Error("A key already exists for this POS. Do not replace it during ATK testing.");

  const generated = await cryptoApi.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
  ) as CryptoKeyPair;
  const [privatePkcs8, publicSpki] = await Promise.all([
    cryptoApi.subtle.exportKey("pkcs8", generated.privateKey),
    cryptoApi.subtle.exportKey("spki", generated.publicKey),
  ]);
  const privateKey = await cryptoApi.subtle.importKey(
    "pkcs8", privatePkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  new Uint8Array(privatePkcs8).fill(0);

  const info = derSequence(
    der(0x02, new Uint8Array([0])),
    subjectName(identity),
    new Uint8Array(publicSpki),
    der(0xa0, new Uint8Array()),
  );
  const signature = await cryptoApi.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, info);
  const algorithm = derSequence(derOid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]));
  const csr = derSequence(info, algorithm, der(0x03, concat(new Uint8Array([0]), ecdsaRawToDer(signature))));
  const createdAt = new Date().toISOString();
  await writeKey({ id, privateKey, publicKeySpki, createdAt });

  const fingerprint = await cryptoApi.subtle.digest("SHA-256", publicSpki);
  const fingerprintHex = Array.from(new Uint8Array(fingerprint), (b) => b.toString(16).padStart(2, "0")).join(":");
  let publicBinary = "";
  for (const byte of new Uint8Array(publicSpki)) publicBinary += String.fromCharCode(byte);
  return {
    csrPem: toPem("CERTIFICATE REQUEST", csr),
    publicKeySpkiBase64: btoa(publicBinary),
    publicKeySha256: fingerprintHex,
    createdAt,
  };
}

export async function signAtkBase64Payload(id: string, base64Payload: string): Promise<string> {
  const cryptoApi = requireBrowserCrypto();
  const record = await readKey(id);
  if (!record) throw new Error("No local signing key exists for this POS.");
  const signature = await cryptoApi.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    record.privateKey,
    new TextEncoder().encode(base64Payload),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function deleteBrowserPosKey(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not delete the local POS key."));
      tx.onabort = () => reject(tx.error ?? new Error("Local POS key deletion was aborted."));
    });
  } finally { db.close(); }
}
