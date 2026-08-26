import { expect, it, vi } from "vitest";
import { database, writeDocuments, pending } from "../src/storage/database";
import { storeFile } from "../src/storage/files";
import { synchronize } from "../src/sync/engine";
import { GraphClient, GraphError, type DriveItem } from "../src/sync/graph";

const bookId = "10000000-0000-4000-8000-000000000001";
const device = "20000000-0000-4000-8000-000000000001";
const metaPath = `books/${bookId}/metadata.json`;
const epubPath = `books/${bookId}/book.epub`;
const progressPath = `progress/${bookId}/${device}.json`;
const meta = { schemaVersion: 1, id: bookId, title: "云端测试", author: "作者", importedAt: "2026-08-26T00:00:00Z", sourceFileName: "a.epub", coverFileName: null };
function fakeGraph() {
  const remote = new Map<string, { item: DriveItem; blob: Blob }>(); const uploaded: string[] = [];
  const graph = {
    json: vi.fn(async () => ({ id: "app", name: "App", folder: {}, eTag: "1" })),
    folder: vi.fn(async (parent: string, name: string) => ({ id: name === "BookReaderLibrary" ? "root" : `${parent}/${name}`, name, folder: {}, eTag: "1" })),
    children: vi.fn(async (parent: string) => {
      const prefix = parent === "root" ? "" : parent.replace(/^root\//, "") + "/"; const children = new Map<string, DriveItem>();
      for (const [path, entry] of remote) if (path.startsWith(prefix)) {
        const rest = path.slice(prefix.length); const slash = rest.indexOf("/");
        if (slash < 0) children.set(rest, entry.item);
        else { const name = rest.slice(0, slash); children.set(name, { id: `root/${prefix}${name}`, name, folder: {}, eTag: "1" }); }
      }
      return [...children.values()];
    }),
    download: vi.fn(async (id: string) => { const entry = remote.get(id)!; return { item: entry.item, blob: entry.blob }; }),
    upload: vi.fn(async (parent: string, name: string, blob: Blob) => {
      const path = `${parent.replace(/^root\/?/, "")}/${name}`.replace(/^\//, ""); uploaded.push(path);
      const item: DriveItem = { id: path, name, file: {}, eTag: crypto.randomUUID(), size: blob.size }; remote.set(path, { item, blob }); return item;
    }),
  };
  const add = (path: string, data: unknown) => { const blob = new Blob([JSON.stringify(data)]); remote.set(path, { item: { id: path, name: path.split("/").pop()!, eTag: "1", file: {}, size: blob.size }, blob }); };
  return { graph, client: graph as unknown as GraphClient, add, remote, uploaded };
}
it("uploads EPUB before metadata and retries without dropping queued writes", async () => {
  const { client, graph, uploaded } = fakeGraph(); const db = await database();
  await storeFile(epubPath, new Blob(["PK EPUB"])); await db.put("queue", pending(epubPath, undefined, "file"));
  await writeDocuments([{ path: metaPath, data: meta }]);
  graph.upload.mockRejectedValueOnce(new GraphError(503, 1));
  await expect(synchronize(client)).rejects.toThrow("503"); expect(await db.count("queue")).toBe(2);
  await synchronize(client); expect(uploaded).toEqual([epubPath, metaPath]); expect(await db.count("queue")).toBe(0);
});
it("does not overwrite dirty local progress with a cloud snapshot", async () => {
  const { client, add, remote } = fakeGraph(); const local = { schemaVersion: 1, cfi: "local", chapterHref: "c", percentage: .4, finished: false, updatedAt: "2026-08-26T00:00:00Z" };
  add(metaPath, meta); add(progressPath, { ...local, cfi: "old" });
  await writeDocuments([{ path: progressPath, data: local }]); await synchronize(client);
  expect((await (await database()).get("documents", progressPath))?.data).toHaveProperty("cfi", "local");
  expect(JSON.parse(await remote.get(progressPath)!.blob.text()).cfi).toBe("local");
});
it("retains a newer progress revision written during an upload", async () => {
  const { client, graph } = fakeGraph();
  const local = { schemaVersion: 1, cfi: "first", chapterHref: "c", percentage: .4, finished: false, updatedAt: "2026-08-26T00:00:00Z" };
  await writeDocuments([{ path: progressPath, data: local }]);
  const original = graph.upload.getMockImplementation()!;
  graph.upload.mockImplementationOnce(async (...args) => { await writeDocuments([{ path: progressPath, data: { ...local, cfi: "newer" } }]); return original(...args); });
  await synchronize(client);
  expect((await (await database()).get("queue", progressPath))?.data).toHaveProperty("cfi", "newer");
});
it("pulls deletion before processing stale progress and does not resurrect the book", async () => {
  const { client, add, uploaded } = fakeGraph(); const opId = crypto.randomUUID();
  add(metaPath, meta); add(`lifecycle/${bookId}/${opId}.json`, { schemaVersion: 1, id: opId, bookId, deviceId: device, action: "delete", restores: [], createdAt: "2026-08-26T00:00:00Z" });
  await writeDocuments([{ path: progressPath, data: { schemaVersion: 1, cfi: "stale", chapterHref: "c", percentage: .4, finished: false, updatedAt: "2026-08-26T00:00:00Z" } }]);
  await synchronize(client); expect(uploaded).not.toContain(progressPath); expect(await (await database()).count("queue")).toBe(0);
});
it("only downloads JSON whose eTag changed", async () => {
  const { client, graph, add } = fakeGraph(); add(metaPath, meta);
  await synchronize(client); graph.download.mockClear(); await synchronize(client);
  expect(graph.download).not.toHaveBeenCalled();
});
it("does not overwrite desktop edits after a metadata upload response was lost", async () => {
  const { client, add, uploaded } = fakeGraph();
  add(metaPath, { ...meta, title: "电脑新书名" }); await writeDocuments([{ path: metaPath, data: meta }]);
  await expect(synchronize(client)).rejects.toThrow("冲突");
  expect(uploaded).not.toContain(metaPath); expect(await (await database()).get("queue", metaPath)).toBeDefined();
});
it("acknowledges identical metadata already uploaded without writing it again", async () => {
  const { client, add, uploaded } = fakeGraph(); add(metaPath, meta);
  await writeDocuments([{ path: metaPath, data: meta }]); await synchronize(client);
  expect(uploaded).not.toContain(metaPath); expect(await (await database()).get("queue", metaPath)).toBeUndefined();
});
it("rejects untrusted pagination URLs without sending a bearer token", async () => {
  const token = vi.fn(async () => "secret"); const request = vi.fn(); const client = new GraphClient(token, request);
  await expect(client.json("https://evil.example/v1.0/files")).rejects.toThrow("不受信任");
  expect(token).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
});
it("downloads signed URLs without an Authorization header", async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "file", name: "a", eTag: "1", size: 2, "@microsoft.graph.downloadUrl": "https://download.example/file" })))
    .mockResolvedValueOnce(new Response("PK"));
  const client = new GraphClient(async () => "secret", request); await client.download("file", 10);
  expect(request.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
  expect(request.mock.calls[1][1].headers).toBeUndefined();
});
