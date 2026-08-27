import type { AnnotationInput, AnnotationRecord, BookNote, BookRecord, LibraryState, ProgressInput } from "../types";
import { database, deviceId, pending, writeDocuments } from "../storage/database";
import { readFile, storeFile } from "../storage/files";
import { notifyLibraryChanged } from "../platform";
import { activeDeletions, parseLifecycle, parseMetadata, requireId, validProgress, type LifecycleOperation, type Metadata, type Progress } from "./protocol";

export const MAX_EPUB_BYTES = 100 * 1024 * 1024;
function readOnly(): never { throw new Error("网页版暂不支持修改书名、封面和整书总结，请在桌面端编辑"); }
export async function operations(bookId: string): Promise<LifecycleOperation[]> {
  requireId(bookId);
  return (await (await database()).getAll("documents"))
    .filter((record) => record.path.startsWith(`lifecycle/${bookId}/`))
    .map((record) => parseLifecycle(record.data, bookId, record.path.split("/")[2].replace(/\.json$/, "")));
}
export async function assertActive(bookId: string) {
  if (activeDeletions(await operations(bookId)).length) throw new Error("图书已删除，请先从回收站恢复");
}
async function records(deleted: boolean): Promise<BookRecord[]> {
  const db = await database();
  const docs = await db.getAll("documents");
  const files = await db.getAll("files");
  const remote = await db.getAll("remote");
  const result: BookRecord[] = [];
  for (const doc of docs) {
    const match = /^books\/([^/]+)\/metadata\.json$/.exec(doc.path);
    if (!match) continue;
    const metadata = parseMetadata(doc.data, match[1]);
    const epubPath = `books/${metadata.id}/book.epub`;
    if (!files.some((file) => file.path === epubPath) && !remote.some((entry) => entry.path === epubPath)) continue;
    const ops = docs.filter((r) => r.path.startsWith(`lifecycle/${metadata.id}/`))
      .map((r) => parseLifecycle(r.data, metadata.id, r.path.split("/")[2].replace(/\.json$/, "")));
    if ((activeDeletions(ops).length > 0) !== deleted) continue;
    const progresses = docs.filter((r) => r.path.startsWith(`progress/${metadata.id}/`) || r.path === `books/${metadata.id}/progress.json`)
      .filter((r) => validProgress(r.data)).sort((a, b) => Date.parse((b.data as Progress).updatedAt) - Date.parse((a.data as Progress).updatedAt) || a.path.localeCompare(b.path));
    const progress = progresses[0]?.data as Progress | undefined;
    const coverPath = metadata.coverFileName ? `books/${metadata.id}/${metadata.coverFileName}` : "";
    const coverBlob = coverPath ? await readFile(coverPath) : undefined;
    const coverDataUrl = coverBlob ? await blobDataUrl(coverBlob) : null;
    result.push({ id: metadata.id, title: metadata.title, author: metadata.author, importedAt: metadata.importedAt,
      progress: progress?.percentage ?? 0, finished: progress?.finished ?? false, cfi: progress?.cfi ?? null,
      chapterHref: progress?.chapterHref ?? null, progressUpdatedAt: progress?.updatedAt,
      progressDeviceId: progresses[0]?.path.startsWith("progress/") ? progresses[0].path.split("/")[2].replace(/\.json$/, "") : null,
      coverDataUrl, cached: files.some((file) => file.path === `books/${metadata.id}/book.epub`),
    });
  }
  return result.sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}
export async function loadLibrary(): Promise<LibraryState> {
  return { libraryDir: "本机离线书库", deviceId: await deviceId(), books: await records(false) };
}
export async function chooseLibraryDirectory() { return loadLibrary(); }
export async function listDeletedBooks() { return records(true); }
export async function deleteBook(bookId: string) {
  await assertActive(bookId);
  const op: LifecycleOperation = { schemaVersion: 1, id: crypto.randomUUID(), bookId, deviceId: await deviceId(), action: "delete", restores: [], createdAt: new Date().toISOString() };
  await writeDocuments([{ path: `lifecycle/${bookId}/${op.id}.json`, data: op }]);
}
export async function restoreDeletedBook(bookId: string) {
  const restores = activeDeletions(await operations(bookId));
  if (!restores.length) return;
  const op: LifecycleOperation = { schemaVersion: 1, id: crypto.randomUUID(), bookId, deviceId: await deviceId(), action: "restore", restores, createdAt: new Date().toISOString() };
  await writeDocuments([{ path: `lifecycle/${bookId}/${op.id}.json`, data: op }]);
}
export async function persistProgress(input: ProgressInput) {
  await assertActive(input.bookId);
  if (!Number.isFinite(input.percentage)) throw new Error("无效的阅读进度");
  const progress: Progress = { schemaVersion: 1, cfi: input.cfi, chapterHref: input.chapterHref,
    percentage: Math.max(0, Math.min(1, input.percentage)), finished: input.percentage >= 0.995, updatedAt: new Date().toISOString() };
  await writeDocuments([{ path: `progress/${input.bookId}/${await deviceId()}.json`, data: progress }]);
}
export async function setBookFinished(bookId: string, finished: boolean) {
  const book = (await records(false)).find((b) => b.id === bookId);
  if (!book) throw new Error("图书不存在");
  await persistProgress({ bookId, cfi: finished ? book.cfi : null, chapterHref: finished ? book.chapterHref : null, percentage: finished ? 1 : 0 });
  return (await records(false)).find((b) => b.id === bookId)!;
}
export async function readBookBytes(bookId: string): Promise<ArrayBuffer> {
  requireId(bookId); await assertActive(bookId);
  let blob = await readFile(`books/${bookId}/book.epub`);
  if (!blob) {
    if (!navigator.onLine) throw new Error("这本书尚未下载，请联网后打开");
    const { downloadBook } = await import("../sync/engine");
    await downloadBook(bookId);
    blob = await readFile(`books/${bookId}/book.epub`);
  }
  if (!blob) throw new Error("找不到 EPUB 缓存，请联网重新下载");
  return blob.arrayBuffer();
}
function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".epub,application/epub+zip"; input.multiple = true; input.style.display = "none";
    const done = (files: File[]) => { input.remove(); resolve(files); };
    input.onchange = () => done(Array.from(input.files ?? []));
    input.addEventListener("cancel", () => done([]), { once: true });
    document.body.append(input); input.click();
  });
}
export async function chooseAndImportEpubs() {
  const files = await pickFiles(); const imported: BookRecord[] = [];
  for (const file of files) imported.push(await importEpub(file));
  return imported;
}
export async function importEpub(file: File): Promise<BookRecord> {
  if (!/\.epub$/i.test(file.name) || !file.size || file.size > MAX_EPUB_BYTES) throw new Error("请选择有效 EPUB；首版单本上限为 100 MB");
  const { default: ePub } = await import("epubjs");
  const bytes = await file.arrayBuffer();
  if (new Uint8Array(bytes)[0] !== 0x50 || new Uint8Array(bytes)[1] !== 0x4b) throw new Error("文件不是有效的 EPUB ZIP 容器");
  const book = ePub(); const id = crypto.randomUUID();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([book.open(bytes, "binary"), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("EPUB 解析超时，请检查文件")), 30000); })]);
    const metadata = await book.loaded.metadata;
    let cover: Blob | undefined;
    try {
      const url = await book.coverUrl();
      if (url?.startsWith("blob:")) {
        const response = await fetch(url); const candidate = await response.blob();
        if (["image/png", "image/jpeg", "image/webp"].includes(candidate.type) && candidate.size <= 5 * 1024 * 1024) cover = candidate;
      }
    } catch { /* Missing cover falls back to a text cover. */ }
    const coverFileName = cover ? `cover.${cover.type === "image/png" ? "png" : cover.type === "image/webp" ? "webp" : "jpg"}` : null;
    const record: Metadata = { schemaVersion: 1, id, title: metadata.title?.trim() || file.name.replace(/\.epub$/i, ""),
      author: metadata.creator?.trim() || "未知作者", importedAt: new Date().toISOString(), sourceFileName: file.name,
      coverFileName, language: metadata.language ?? null, publisher: metadata.publisher ?? null, description: metadata.description ?? null };
    const epubPath = `books/${id}/book.epub`;
    await storeFile(epubPath, new Blob([bytes], { type: "application/epub+zip" }));
    if (cover && coverFileName) await storeFile(`books/${id}/${coverFileName}`, cover);
    const db = await database(); const tx = db.transaction(["documents", "queue"], "readwrite");
    const metadataPath = `books/${id}/metadata.json`;
    await tx.objectStore("documents").put({ path: metadataPath, data: record });
    await tx.objectStore("queue").put(pending(epubPath, undefined, "file"));
    if (coverFileName) await tx.objectStore("queue").put(pending(`books/${id}/${coverFileName}`, undefined, "file"));
    await tx.objectStore("queue").put(pending(metadataPath, record)); await tx.done;
    notifyLibraryChanged(); return (await records(false)).find((b) => b.id === id)!;
  } finally { clearTimeout(timeout); book.destroy(); }
}
export async function loadAnnotations(bookId: string): Promise<AnnotationRecord[]> {
  requireId(bookId);
  return (await (await database()).getAll("documents")).filter((r) => r.path.startsWith(`annotations/${bookId}/`))
    .map((r) => r.data as AnnotationRecord).filter((r) => r.bookId === bookId && r.schemaVersion === 1 && !r.deletedAt)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}
export async function loadBookNote(bookId: string): Promise<BookNote> {
  requireId(bookId);
  return (await (await database()).get("documents", `notes/${bookId}.json`))?.data as BookNote
    ?? { schemaVersion: 1, bookId, summary: "", updatedAt: "" };
}
export async function renameBook(_id: string, _title: string): Promise<BookRecord> { return readOnly(); }
export async function chooseCustomCover(_id: string): Promise<BookRecord | null> { return readOnly(); }
export async function restoreBookCover(_id: string): Promise<BookRecord> { return readOnly(); }
export async function saveAnnotation(input: AnnotationInput): Promise<AnnotationRecord> {
  requireId(input.bookId); await assertActive(input.bookId);
  if (!input.quote.trim() || !input.cfiRange.trim()) throw new Error("高亮原文和位置不能为空");
  const id = input.id ?? crypto.randomUUID(); requireId(id);
  const path = `annotations/${input.bookId}/${id}.json`;
  const existing = (await (await database()).get("documents", path))?.data as AnnotationRecord | undefined;
  const now = new Date().toISOString();
  const record: AnnotationRecord = {
    schemaVersion: 1, id, bookId: input.bookId, recordType: "quote-note",
    quote: input.quote.trim(), reflection: input.reflection.trim(), chapterTitle: input.chapterTitle.trim(),
    chapterHref: input.chapterHref, cfiRange: input.cfiRange,
    createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: null,
  };
  await writeDocuments([{ path, data: record }]);
  return record;
}
export async function removeAnnotation(bookId: string, annotationId: string): Promise<void> {
  requireId(bookId); requireId(annotationId); await assertActive(bookId);
  const path = `annotations/${bookId}/${annotationId}.json`;
  const db = await database();
  const record = (await db.get("documents", path))?.data as AnnotationRecord | undefined;
  if (!record || record.bookId !== bookId || record.id !== annotationId) throw new Error("找不到这条笔记");
  const now = new Date().toISOString();
  await writeDocuments([{ path, data: { ...record, updatedAt: now, deletedAt: now } }]);
}
export async function persistBookNote(_id: string, _summary: string): Promise<BookNote> { return readOnly(); }
export function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}
