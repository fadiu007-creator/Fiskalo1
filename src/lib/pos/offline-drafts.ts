export type OfflinePosDraft = {
  id: string;
  organizationId: string;
  createdAt: string;
  cart: Array<{ productId: string; quantity: string }>;
  customerId: string;
  paymentMethod: string;
  discountPercent?: number;
};

const DATABASE = "fiskalo-pos-local";
const STORE = "order-drafts";

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Ruajtja lokale nuk mbështetet në këtë shfletues."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("organizationId", "organizationId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Nuk u hap ruajtja lokale."));
    request.onblocked = () => reject(new Error("Mbyll skedat e tjera të Fiskalo-s dhe provo përsëri."));
  });
}

export async function listOfflinePosDrafts(organizationId: string): Promise<OfflinePosDraft[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).index("organizationId").getAll(organizationId);
      request.onsuccess = () => resolve((request.result as OfflinePosDraft[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error ?? new Error("Draftet nuk u lexuan."));
      tx.onabort = () => reject(tx.error ?? new Error("Leximi i draftit u anulua."));
    });
  } finally {
    db.close();
  }
}

export async function saveOfflinePosDraft(draft: OfflinePosDraft): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite", { durability: "strict" });
      tx.objectStore(STORE).put(draft);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Drafti nuk u ruajt."));
      tx.onabort = () => reject(tx.error ?? new Error("Ruajtja e draftit u anulua."));
    });
  } finally {
    db.close();
  }
}

export async function deleteOfflinePosDraft(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Drafti nuk u fshi."));
      tx.onabort = () => reject(tx.error ?? new Error("Fshirja e draftit u anulua."));
    });
  } finally {
    db.close();
  }
}
