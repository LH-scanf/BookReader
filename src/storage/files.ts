import { database, type CachedFile } from "./database";

export async function storeFile(path: string, blob: Blob, etag?: string) {
  const db = await database();
  const old = await db.get("files", path);
  const key = crypto.randomUUID();
  let record: CachedFile = { path, key, size: blob.size, backend: "idb", blob, etag };
  let root: FileSystemDirectoryHandle | undefined;
  try {
    root = await navigator.storage?.getDirectory?.();
  } catch { /* OPFS is unavailable in some browser modes; use IndexedDB. */ }
  if (root) {
    try {
      const handle = await root.getFileHandle(key, { create: true });
      // Safari 17 can expose OPFS but not the asynchronous writable stream.
      // A missing API is a supported fallback; quota/write failures are not.
      if (typeof handle.createWritable !== "function") {
        await root.removeEntry(key).catch(() => undefined);
        root = undefined;
      } else {
        const writable = await handle.createWritable();
        try { await writable.write(blob); await writable.close(); }
        catch (error) { await writable.abort().catch(() => undefined); throw error; }
        record = { path, key, size: blob.size, backend: "opfs", etag };
      }
    } catch (error) {
      await root?.removeEntry(key).catch(() => undefined);
      throw error;
    }
  }
  try { await db.put("files", record); }
  catch (error) { if (root) await root.removeEntry(key).catch(() => undefined); throw error; }
  if (old?.backend === "opfs" && root) await root.removeEntry(old.key).catch(() => undefined);
}
export async function readFile(path: string): Promise<Blob | undefined> {
  const record = await (await database()).get("files", path);
  if (!record) return;
  if (record.backend === "idb") return record.blob;
  try { return await (await (await navigator.storage.getDirectory()).getFileHandle(record.key)).getFile(); }
  catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return;
    throw error;
  }
}
export async function removeCachedFile(path: string) {
  const db = await database();
  // Only remotely backed, clean files may be evicted. Never discard an offline import.
  if (await db.get("queue", path) || !await db.get("remote", path)) throw new Error("尚未上传成功，不能移除这份本机文件");
  const record = await db.get("files", path);
  if (record?.backend === "opfs") {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(record.key).catch((error) => { if (error.name !== "NotFoundError") throw error; });
  }
  await db.delete("files", path);
}
