// IndexedDBアダプタ（save-system仕様: スロット10＋自動セーブ、メタ表示、容量警告）
export interface SaveSlotMeta {
  slot: string;
  tick: number;
  dateStr: string;
  ts: number;
  auto: boolean;
}

const DB_NAME = 'orbis';
const STORE = 'saves';
export const MANUAL_SLOTS = 10;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    let blocked = false;
    req.onblocked = () => { blocked = true; reject(new Error('IndexedDB open blocked')); };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => { if (blocked) req.result.close(); else resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction | undefined;
    try {
      t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); resolve(req.result as T); };
      t.onabort = () => { db.close(); reject(t?.error ?? req.error ?? new Error('IndexedDB transaction aborted')); };
      // request errors propagate to the transaction; onabort performs final cleanup.
      t.onerror = () => { /* default abort behavior */ };
    } catch (err) {
      try { t?.abort(); } catch { /* already finished */ }
      db.close();
      reject(err);
    }
  });
}

export async function saveSlot(slot: string, buf: Uint8Array, meta: Omit<SaveSlotMeta, 'slot'>): Promise<void> {
  await tx('readwrite', (store) => store.put({ buf, meta: { ...meta, slot } }, slot));
}

export async function loadSlot(slot: string): Promise<{ buf: Uint8Array; meta: SaveSlotMeta } | null> {
  const v = await tx<{ buf: Uint8Array; meta: SaveSlotMeta } | undefined>('readonly', (store) => store.get(slot));
  return v ?? null;
}

export async function listSlots(): Promise<SaveSlotMeta[]> {
  const all = await tx<{ buf: Uint8Array; meta: SaveSlotMeta }[]>('readonly', (store) => store.getAll());
  if (!all) return [];
  return all
    .map((v) => v.meta)
    .sort((a, b) => b.ts - a.ts);
}

export async function deleteSlot(slot: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(slot));
}

export async function saveAutosave(buf: Uint8Array, tick: number, dateStr: string): Promise<void> {
  await saveSlot('auto', buf, { tick, dateStr, ts: Date.now(), auto: true });
}

export async function storageEstimateWarn(): Promise<boolean> {
  if (!navigator.storage?.estimate) return false;
  const { usage, quota } = await navigator.storage.estimate();
  if (!usage || !quota) return false;
  return usage / quota > 0.9;
}
