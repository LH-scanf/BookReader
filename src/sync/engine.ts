import { requireAccount } from "../auth/microsoft";
import { database, acknowledge, getSetting, setSetting, type RemoteRecord, type DocumentRecord } from "../storage/database";
import { readFile, storeFile, removeCachedFile } from "../storage/files";
import { activeDeletions, parseLifecycle, parseMetadata, uuidPattern, validProgress } from "../library/protocol";
import { assertActive, MAX_EPUB_BYTES } from "../library/WebProvider";
import { notifyLibraryChanged } from "../platform";
import { GraphClient, GraphError, type DriveItem } from "./graph";

export type SyncStatus = { phase: "idle" | "syncing" | "error"; message: string };
let status: SyncStatus = { phase: "idle", message: "本机保存；登录后可同步 OneDrive" };
const listeners = new Set<() => void>();
export const syncSnapshot = () => status;
export function subscribeSync(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; }
function report(phase: SyncStatus["phase"], message: string) { status = { phase, message }; listeners.forEach((fn) => fn()); }
let running: Promise<void> | undefined;
let retryAt = 0;
export function syncNow() {
  if (running) return running;
  running = (async () => {
    if (!navigator.onLine) throw new Error("当前离线，已保存到本机，联网后同步");
    if (Date.now() < retryAt) throw new Error("OneDrive 暂时限流，请稍后重试");
    if (!navigator.locks) throw new Error("当前浏览器缺少安全同步锁，请升级浏览器；本地阅读不受影响");
    await navigator.locks.request("bookreader-sync", async () => {
      report("syncing", "正在同步 OneDrive…");
      await requireAccount(); await synchronize(new GraphClient());
      const count = await (await database()).count("queue");
      report("idle", count ? `已同步；还有 ${count} 项本机变更等待下一轮上传` : "已同步到 OneDrive");
    });
  })().catch((error: unknown) => {
    if (error instanceof GraphError && [429, 503].includes(error.status)) retryAt = Date.now() + error.retryAfter * 1000;
    report("error", error instanceof Error ? error.message : "同步失败，本机数据已保留");
    throw error;
  }).finally(() => { running = undefined; });
  return running;
}
async function libraryRoot(graph: GraphClient) {
  const root = await graph.json<DriveItem>("/me/drive/special/approot");
  const library = await graph.folder(root.id, "BookReaderLibrary");
  const boundRoot = await getSetting<string>("boundRoot");
  if (boundRoot && boundRoot !== library.id) throw new Error("云端书库目录已改变；已停止自动上传，请核对目录并备份本机数据");
  await setSetting("boundRoot", library.id); await setSetting("libraryWebUrl", library.webUrl ?? "");
  return library.id;
}
function acceptedPath(path: string) {
  const parts = path.split("/");
  if (parts.length === 2 && parts[0] === "notes") return uuidPattern.test(parts[1].replace(/\.json$/, "")) && parts[1].endsWith(".json");
  if (parts.length !== 3 || !uuidPattern.test(parts[1])) return false;
  if (parts[0] === "books") return /^(book\.epub|metadata\.json|progress\.json|[\w.-]+\.(png|jpg|jpeg|webp))$/i.test(parts[2]);
  return ["progress", "annotations", "lifecycle"].includes(parts[0]) && parts[2].endsWith(".json") && uuidPattern.test(parts[2].slice(0, -5));
}
async function inventory(graph: GraphClient, root: string) {
  const result: RemoteRecord[] = [];
  async function scan(id: string, prefix: string, depth: number) {
    for (const item of await graph.children(id)) {
      if (item.name.includes("/") || item.name.includes("\\")) continue;
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.folder && depth < 2 && (depth === 0 ? ["books", "progress", "annotations", "notes", "lifecycle"].includes(item.name) : uuidPattern.test(item.name))) await scan(item.id, path, depth + 1);
      else if (item.file && acceptedPath(path)) result.push({ path, id: item.id, etag: item.eTag, size: item.size ?? 0 });
    }
  }
  await scan(root, "", 0); return result;
}
function validateDocument(path: string, value: unknown) {
  const parts = path.split("/");
  if (parts[0] === "lifecycle") parseLifecycle(value, parts[1], parts[2].slice(0, -5));
  else if (parts[2] === "metadata.json") parseMetadata(value, parts[1]);
  else if ((parts[0] === "progress" || parts[2] === "progress.json") && !validProgress(value)) throw new Error("云端阅读进度损坏");
  else if (parts[0] === "notes" || parts[0] === "annotations") {
    const record = value as Record<string, unknown>;
    const bookId = parts[0] === "notes" ? parts[1].slice(0, -5) : parts[1];
    if (!record || record.schemaVersion !== 1 || record.bookId !== bookId) throw new Error("云端笔记格式无效");
    if (parts[0] === "notes" && typeof record.summary !== "string") throw new Error("云端整书笔记无效");
    if (parts[0] === "annotations" && (record.id !== parts[2].slice(0, -5) || !["quote", "reflection", "cfiRange", "chapterTitle", "chapterHref"].every((key) => typeof record[key] === "string"))) throw new Error("云端批注无效");
  }
}
export async function synchronize(graph: GraphClient) {
  const root = await libraryRoot(graph); const db = await database();
  const entries = await inventory(graph, root);
  const oldEntries = await db.getAll("remote"); const old = new Map(oldEntries.map((entry) => [entry.path, entry]));
  const incoming: DocumentRecord[] = [];
  for (const entry of entries) {
    if (await db.get("queue", entry.path)) continue;
    if (entry.path.endsWith(".json")) {
      if (old.get(entry.path)?.etag === entry.etag && await db.get("documents", entry.path)) continue;
      const downloaded = await graph.download(entry.id, 5 * 1024 * 1024);
      if (downloaded.item.eTag !== entry.etag) throw new Error("云端文件正在变化，请重试同步");
      const data: unknown = JSON.parse(await downloaded.blob.text()); validateDocument(entry.path, data);
      incoming.push({ path: entry.path, data });
    } else if (!entry.path.endsWith(".epub")) {
      if ((await db.get("files", entry.path))?.etag === entry.etag) continue;
      const downloaded = await graph.download(entry.id, 5 * 1024 * 1024);
      if (downloaded.item.eTag !== entry.etag) throw new Error("云端封面正在变化，请重试同步");
      await storeFile(entry.path, downloaded.blob, entry.etag);
    }
  }
  // Publish documents together, so metadata cannot become visible before its deletion marker.
  const tx = db.transaction(["documents", "remote", "queue"], "readwrite");
  for (const record of incoming) if (!await tx.objectStore("queue").get(record.path)) await tx.objectStore("documents").put(record);
  for (const entry of entries) await tx.objectStore("remote").put(entry);
  const paths = new Set(entries.map((e) => e.path));
  for (const entry of oldEntries) if (!paths.has(entry.path)) {
    await tx.objectStore("remote").delete(entry.path);
    // Retain immutable lifecycle history even if someone removes cloud operation files.
    if (!entry.path.startsWith("lifecycle/") && !await tx.objectStore("queue").get(entry.path)) await tx.objectStore("documents").delete(entry.path);
  }
  await tx.done;
  notifyLibraryChanged();
  const folderIds = new Map<string, string>([["", root]]);
  async function parent(path: string): Promise<string> {
    if (folderIds.has(path)) return folderIds.get(path)!;
    const parts = path.split("/"); const name = parts.pop()!;
    const folder = await graph.folder(await parent(parts.join("/")), name); folderIds.set(path, folder.id); return folder.id;
  }
  const queue = await db.getAll("queue");
  const priority = (path: string) => path.startsWith("lifecycle/") ? 0 : path.endsWith("metadata.json") ? 3 : path.startsWith("progress/") ? 2 : 1;
  queue.sort((a, b) => priority(a.path) - priority(b.path) || a.path.localeCompare(b.path));
  for (const write of queue) {
    if ((await db.get("queue", write.path))?.revision !== write.revision) continue;
    if (!acceptedPath(write.path)) throw new Error("拒绝上传书库协议之外的路径");
    if (write.path.startsWith("progress/")) {
      const bookId = write.path.split("/")[1];
      const docs = await db.getAll("documents");
      const ops = docs.filter((r) => r.path.startsWith(`lifecycle/${bookId}/`)).map((r) => parseLifecycle(r.data, bookId, r.path.split("/")[2].slice(0, -5)));
      if (activeDeletions(ops).length) { await acknowledge(write.path, write.revision); continue; }
    }
    const blob = write.kind === "file" ? await readFile(write.path) : new Blob([JSON.stringify(write.data)], { type: "application/json" });
    if (!blob) throw new Error("待上传文件缓存缺失，已停止上传；请勿清理站点数据");
    // A previous upload may have succeeded even if its response was lost. Never
    // overwrite an existing imported file or immutable operation on retry.
    const existing = entries.find((entry) => entry.path === write.path);
    if (existing && !write.path.startsWith("progress/")) {
      const downloaded = await graph.download(existing.id, write.kind === "file" ? MAX_EPUB_BYTES : 5 * 1024 * 1024);
      const canonical = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) => {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)));
        return entry;
      });
      const same = write.kind === "json"
        ? canonical(JSON.parse(await downloaded.blob.text())) === canonical(write.data)
        : blob.size === downloaded.blob.size && await digest(blob) === await digest(downloaded.blob);
      if (!same) throw new Error(`云端文件与本机待上传内容冲突：${write.path}。已停止自动覆盖，两份内容均保留，请先备份并核对`);
      await acknowledge(write.path, write.revision); continue;
    }
    const parts = write.path.split("/"); const name = parts.pop()!;
    try {
      const item = await graph.upload(await parent(parts.join("/")), name, blob);
      await db.put("remote", { path: write.path, id: item.id, etag: item.eTag, size: item.size ?? blob.size });
      await acknowledge(write.path, write.revision);
    } catch (error) {
      const update = db.transaction("queue", "readwrite"); const current = await update.store.get(write.path);
      if (current?.revision === write.revision) await update.store.put({ ...current, attempts: current.attempts + 1 });
      await update.done; throw error;
    }
  }
  await setSetting("lastSyncAt", new Date().toISOString()); notifyLibraryChanged();
}
async function digest(blob: Blob) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function downloadBook(bookId: string) {
  await requireAccount(); await assertActive(bookId);
  const path = `books/${bookId}/book.epub`; const db = await database(); const remote = await db.get("remote", path);
  if (!remote) throw new Error("云端暂无完整 EPUB，请先同步书库，或等待电脑完成上传");
  const { blob, item } = await new GraphClient().download(remote.id, MAX_EPUB_BYTES);
  const prefix = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (prefix[0] !== 0x50 || prefix[1] !== 0x4b) throw new Error("云端 EPUB 文件格式无效");
  await assertActive(bookId); await storeFile(path, blob, item.eTag);
  notifyLibraryChanged();
}
export async function evictBook(bookId: string) { await removeCachedFile(`books/${bookId}/book.epub`); notifyLibraryChanged(); }
