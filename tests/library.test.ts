import { describe, expect, it, vi } from "vitest";
import { activeDeletions, parseLifecycle, type LifecycleOperation } from "../src/library/protocol";
import { database, writeDocuments, acknowledge, deviceId } from "../src/storage/database";
import { loadLibrary, deleteBook, listDeletedBooks, restoreDeletedBook, persistProgress, readBookBytes, saveAnnotation } from "../src/library/WebProvider";
import { readFile, storeFile, removeCachedFile } from "../src/storage/files";

const id = "10000000-0000-4000-8000-000000000001";
const metadata = { schemaVersion: 1, id, title: "测试书", author: "测试作者", importedAt: "2026-08-26T00:00:00Z", sourceFileName: "test.epub", coverFileName: null };
function op(action: "delete" | "restore", restores: string[] = []): LifecycleOperation {
  return { schemaVersion: 1, id: crypto.randomUUID(), bookId: id, deviceId: crypto.randomUUID(), action, restores, createdAt: new Date().toISOString() };
}
async function seed() { await writeDocuments([{ path: `books/${id}/metadata.json`, data: metadata }]); await storeFile(`books/${id}/book.epub`, new Blob(["PK test"])); }

describe("delete/restore protocol", () => {
  it("keeps unseen concurrent deletions active, regardless of clock and ordering", () => {
    const first = op("delete"); const second = op("delete"); const restore = op("restore", [first.id]);
    expect(activeDeletions([restore, first, second])).toEqual([second.id]);
    expect(activeDeletions([first, restore])).toEqual([]);
  });
  it("rejects corrupt lifecycle documents instead of resurrecting a book", () => {
    const value = op("delete");
    expect(() => parseLifecycle({ ...value, restores: null }, id, value.id)).toThrow();
    expect(() => parseLifecycle(value, crypto.randomUUID(), value.id)).toThrow();
  });
});
describe("local library and durable queue", () => {
  it("falls back to IndexedDB when OPFS exists without createWritable (Safari 17)", async () => {
    const previous = navigator.storage;
    Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory: async () => ({ getFileHandle: async () => ({}), removeEntry: vi.fn(async () => undefined) }) } });
    try {
      await storeFile("fallback.epub", new Blob(["PK fallback"]));
      expect((await (await database()).get("files", "fallback.epub"))?.backend).toBe("idb");
      expect(await (await readFile("fallback.epub"))!.text()).toBe("PK fallback");
    } finally { Object.defineProperty(navigator, "storage", { configurable: true, value: previous }); }
  });
  it("soft deletes and restores without removing bytes or notes", async () => {
    await seed(); await writeDocuments([{ path: `notes/${id}.json`, data: { schemaVersion: 1, bookId: id, summary: "保留笔记", updatedAt: "2026-08-26T00:00:00Z" } }]);
    await deleteBook(id);
    expect((await loadLibrary()).books).toHaveLength(0);
    expect(await listDeletedBooks()).toHaveLength(1);
    expect(await (await readFile(`books/${id}/book.epub`))!.text()).toBe("PK test");
    await expect(persistProgress({ bookId: id, cfi: "x", chapterHref: "chapter.xhtml", percentage: .5 })).rejects.toThrow("已删除");
    await restoreDeletedBook(id);
    expect((await loadLibrary()).books[0].title).toBe("测试书");
    expect((await (await database()).get("documents", `notes/${id}.json`))?.data).toHaveProperty("summary", "保留笔记");
    expect(new TextDecoder().decode(await readBookBytes(id))).toBe("PK test");
  });
  it("saves device progress and queue atomically; acknowledgement preserves newer changes", async () => {
    await seed(); const input = { bookId: id, cfi: "first", chapterHref: "c.xhtml", percentage: .5 };
    await persistProgress(input);
    const db = await database(); const path = `progress/${id}/${await deviceId()}.json`;
    const first = (await db.get("queue", path))!;
    await persistProgress({ ...input, cfi: "second", percentage: .2 });
    await acknowledge(path, first.revision);
    expect((await db.get("queue", path))?.data).toHaveProperty("cfi", "second");
    expect((await loadLibrary()).books[0].progress).toBe(.2);
    await acknowledge(path, (await db.get("queue", path))!.revision);
    expect(await db.get("queue", path)).toBeUndefined();
  });
  it("picks the latest progress, not the furthest percentage", async () => {
    await seed(); const db = await database();
    for (const [device, percentage, day] of [["a", .9, "25"], ["b", .1, "26"]] as const) await db.put("documents", {
      path: `progress/${id}/${device}.json`, data: { schemaVersion: 1, cfi: device, chapterHref: "c", percentage, finished: false, updatedAt: `2026-08-${day}T00:00:00Z` },
    });
    expect((await loadLibrary()).books[0]).toMatchObject({ progress: .1, cfi: "b", progressDeviceId: "b" });
  });
  it("cannot evict the only local copy; can evict a clean cloud-backed file", async () => {
    await seed(); const path = `books/${id}/book.epub`;
    await expect(removeCachedFile(path)).rejects.toThrow("尚未上传");
    await (await database()).put("remote", { path, id: "remote-file", etag: "1", size: 7 });
    await removeCachedFile(path); expect(await readFile(path)).toBeUndefined();
    expect((await loadLibrary()).books).toHaveLength(1);
  });
  it("prevents unsupported browser note edits", async () => {
    await expect(saveAnnotation({ bookId: id, quote: "q", reflection: "r", chapterTitle: "c", chapterHref: "c", cfiRange: "x" })).rejects.toThrow("首版仅支持查看");
  });
});
