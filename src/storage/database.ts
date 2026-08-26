import { openDB, type DBSchema } from "idb";
import { notifyLibraryChanged } from "../platform";

export type DocumentRecord = { path: string; data: unknown };
export type CachedFile = { path: string; backend: "opfs" | "idb"; key: string; blob?: Blob; size: number; etag?: string };
export type PendingWrite = { path: string; revision: string; kind: "json" | "file"; data?: unknown; attempts: number; createdAt: string };
export type RemoteRecord = { path: string; id: string; etag: string; size: number };
interface LibraryDatabase extends DBSchema {
  documents: { key: string; value: DocumentRecord };
  files: { key: string; value: CachedFile };
  queue: { key: string; value: PendingWrite };
  settings: { key: string; value: unknown };
  remote: { key: string; value: RemoteRecord };
}
let dbPromise: ReturnType<typeof openDB<LibraryDatabase>> | undefined;
export function database() {
  return dbPromise ??= openDB<LibraryDatabase>("bookreader-web-v1", 1, {
    upgrade(db) {
      db.createObjectStore("documents", { keyPath: "path" });
      db.createObjectStore("files", { keyPath: "path" });
      db.createObjectStore("queue", { keyPath: "path" });
      db.createObjectStore("settings");
      db.createObjectStore("remote", { keyPath: "path" });
    },
    blocking() { void dbPromise?.then((db) => db.close()); dbPromise = undefined; },
    terminated() { dbPromise = undefined; },
  });
}
export async function deviceId() {
  const db = await database();
  const tx = db.transaction("settings", "readwrite");
  let id = await tx.store.get("deviceId") as string | undefined;
  if (!id) { id = crypto.randomUUID(); await tx.store.put(id, "deviceId"); }
  await tx.done;
  return id;
}
export function pending(path: string, data?: unknown, kind: "json" | "file" = "json"): PendingWrite {
  return { path, data, kind, revision: crypto.randomUUID(), attempts: 0, createdAt: new Date().toISOString() };
}
export async function writeDocuments(records: DocumentRecord[]) {
  const db = await database();
  const tx = db.transaction(["documents", "queue"], "readwrite");
  for (const record of records) {
    await tx.objectStore("documents").put(record);
    await tx.objectStore("queue").put(pending(record.path, record.data));
  }
  await tx.done;
  notifyLibraryChanged();
}
export async function acknowledge(path: string, revision: string) {
  const db = await database();
  const tx = db.transaction("queue", "readwrite");
  if ((await tx.store.get(path))?.revision === revision) await tx.store.delete(path);
  await tx.done;
}
export async function getSetting<T>(key: string) { return (await database()).get("settings", key) as Promise<T | undefined>; }
export async function setSetting(key: string, value: unknown) { await (await database()).put("settings", value, key); }
