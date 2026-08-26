import { expect, it, vi } from "vitest";
import { database, writeDocuments, pending } from "../src/storage/database";
import { storeFile } from "../src/storage/files";
import { synchronize, syncNow, syncSnapshot } from "../src/sync/engine";
import * as microsoftAuth from "../src/auth/microsoft";
import { GraphClient, GraphError, type DriveItem } from "../src/sync/graph";
import { runGraphDiagnostics, type DiagnosticEntry } from "../src/sync/diagnostics";

const bookId = "10000000-0000-4000-8000-000000000001";
const device = "20000000-0000-4000-8000-000000000001";
const metaPath = `books/${bookId}/metadata.json`;
const epubPath = `books/${bookId}/book.epub`;
const progressPath = `progress/${bookId}/${device}.json`;
const meta = { schemaVersion: 1, id: bookId, title: "云端测试", author: "作者", importedAt: "2026-08-26T00:00:00Z", sourceFileName: "a.epub", coverFileName: null };
it("requires explicit connection consent before manual or automatic sync can start", async () => {
  const request = vi.spyOn(globalThis, "fetch");
  try {
    await expect(syncNow()).rejects.toThrow("连接并同步书库");
    expect(request).not.toHaveBeenCalled();
    expect(await (await database()).get("settings", "boundAccount")).toBeUndefined();
  } finally { request.mockRestore(); }
});
it.each([401, 403])("pauses foreground retries after Graph HTTP %s without changing consent or the queue", async (status) => {
  const locks = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name: string, callback: () => Promise<void>) => callback() } });
  const auth = vi.spyOn(microsoftAuth, "requireAccount").mockResolvedValue({ homeAccountId: "a", localAccountId: "a", tenantId: "consumers", environment: "login.live.com", username: "a@example.test" });
  const graph = vi.spyOn(GraphClient.prototype, "json").mockRejectedValue(new GraphError(status, 60));
  const db = await database(); await db.put("settings", true, "syncConsent"); await db.put("queue", pending(metaPath, meta));
  try {
    await expect(syncNow()).rejects.toThrow(`HTTP ${status}`);
    expect(syncSnapshot()).toMatchObject({ phase: "error", requiresAction: true });
    expect(syncSnapshot().message).toContain("自动重试已暂停");
    expect(await db.get("settings", "syncConsent")).toBe(true); expect(await db.count("queue")).toBe(1);
  } finally { auth.mockRestore(); graph.mockRestore(); if (locks) Object.defineProperty(navigator, "locks", locks); else Reflect.deleteProperty(navigator, "locks"); }
});
function fakeGraph() {
  const remote = new Map<string, { item: DriveItem; blob: Blob }>(); const uploaded: string[] = [];
  const graph = {
    json: vi.fn(async () => ({ id: "app", name: "App", folder: {}, eTag: "1" })),
    item: vi.fn(async (id: string): Promise<DriveItem> => id === "root"
      ? { id: "root", name: "BookReaderLibrary", folder: {}, parentReference: { id: "app" }, eTag: "folder-metadata-only", cTag: JSON.stringify([...remote].map(([path, entry]) => [path, entry.item.eTag])) }
      : remote.get(id)!.item),
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
    upload: vi.fn(async (parent: string, name: string, blob: Blob, conflict: "fail" | "replace" = "fail") => {
      const path = `${parent.replace(/^root\/?/, "")}/${name}`.replace(/^\//, ""); uploaded.push(path);
      if (conflict === "fail" && remote.has(path)) throw new GraphError(409, 60);
      const item: DriveItem = { id: path, name, file: {}, eTag: crypto.randomUUID(), size: blob.size }; remote.set(path, { item, blob }); return item;
    }),
  };
  const add = (path: string, data: unknown) => { const blob = new Blob([JSON.stringify(data)]); remote.set(path, { item: { id: path, name: path.split("/").pop()!, eTag: crypto.randomUUID(), file: {}, size: blob.size }, blob }); };
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
  await synchronize(client); graph.download.mockClear(); graph.children.mockClear(); await synchronize(client);
  expect(graph.download).not.toHaveBeenCalled();
  expect(graph.children).not.toHaveBeenCalled();
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
it("reports the failing Graph operation and safe error fields without private response data", async () => {
  const requestId = "10000000-0000-4000-8000-000000000001";
  const request = vi.fn(async () => new Response(JSON.stringify({ error: {
    code: "accessDenied", message: "Denied to person@example.test at https://example.test/?token=private Bearer private-credential",
    innerError: { code: "serviceReadOnly", trace: "private-server-data" },
  } }), { status: 403, headers: { "request-id": requestId } }));
  const client = new GraphClient(async () => "private-token", request);
  let failure: unknown;
  try { await client.json("/me/drive/special/approot"); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(GraphError);
  const error = failure as GraphError;
  expect(error.diagnostic).toMatchObject({ operation: "访问应用专用目录", code: "accessDenied / serviceReadOnly", requestId });
  expect(error.message).not.toMatch(/person@example|private|https:\/\//);
  expect(error.message).toContain("HTTP 403");
});
it.each(["<html>upstream error</html>", "x".repeat(17000)])("keeps the HTTP failure when the error body cannot safely be parsed", async (body) => {
  const client = new GraphClient(async () => "test", vi.fn(async () => new Response(body, { status: 503, headers: { "Retry-After": "12" } })));
  let failure: unknown;
  try { await client.json("/me/drive/items/test/children"); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(GraphError);
  expect((failure as GraphError).retryAfter).toBe(12);
  expect((failure as GraphError).diagnostic).toMatchObject({ operation: "读取目录内容", code: undefined, detail: undefined });
  expect((failure as GraphError).diagnostic?.trace?.bodyNote).toBeTruthy();
});
it("preserves nested innerError and correlation metadata but excludes credentials from diagnostics", async () => {
  const requestId = crypto.randomUUID(); const emit = vi.fn();
  const innerError = { code: "serviceReadOnly", message: "Database Is Read Only", date: "2026-08-26T08:00:00Z",
    "request-id": requestId, innerError: { code: "itemDisabledDueToPendingProvisioning", message: "User is pending provisioning" } };
  const request = vi.fn(async () => new Response(JSON.stringify({ error: { code: "accessDenied", innerError,
    Authorization: "Bearer hidden", access_token: "hidden", id_token: "hidden", echoed: "opaque-test-token", extra: { refresh_token: "hidden" } } }),
    { status: 403, headers: { "request-id": requestId, date: "Wed, 26 Aug 2026 08:00:00 GMT" } }));
  await expect(new GraphClient(async () => "opaque-test-token", request, emit).json("/me/drive/special/approot")).rejects.toThrow("HTTP 403");
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: 403, requestId, date: "Wed, 26 Aug 2026 08:00:00 GMT",
    clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/), error: expect.objectContaining({ innerError }) }));
  expect(JSON.stringify(emit.mock.calls)).not.toMatch(/Authorization|access_token|id_token|refresh_token|opaque-test-token|hidden/);
  const options = (request.mock.calls as unknown as [string, RequestInit][])[0][1];
  expect((options.headers as Record<string, string>)["client-request-id"]).toBe(emit.mock.calls[0][0].clientRequestId);
});
it("uses one token in order for identity, failed root, non-overwriting probe and successful root retry", async () => {
  const getToken = vi.fn(async () => "same-opaque-token"); const entries: DiagnosticEntry[] = [];
  const responses = [new Response(JSON.stringify({ mail: "private@example.test" })),
    new Response(JSON.stringify({ error: { code: "accessDenied" } }), { status: 403 }),
    new Response(JSON.stringify({ id: "probe" }), { status: 201 }), new Response(JSON.stringify({ id: "approot" }))];
  const request = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => responses.shift()!);
  await runGraphDiagnostics(true, true, (entry) => entries.push(entry), getToken, request);
  expect(getToken).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.map(([url]) => String(url).replace("https://graph.microsoft.com/v1.0", ""))).toEqual([
    "/me", "/me/drive/special/approot",
    "/me/drive/special/approot:/__bookreader_probe.txt:/content?@microsoft.graph.conflictBehavior=fail", "/me/drive/special/approot",
  ]);
  expect(request.mock.calls[2][1]).toMatchObject({ method: "PUT", body: "BookReader probe" });
  for (const [, init] of request.mock.calls) expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer same-opaque-token");
  expect(entries.map((entry) => entry.status)).toEqual([200, 403, 201, 200]);
  expect(new Set(entries.map((entry) => entry.clientRequestId)).size).toBe(4);
  expect(JSON.stringify(entries)).not.toMatch(/private@example|same-opaque-token|Authorization/);
});
it.each([
  { compare: false, allow: true, statuses: [403], calls: 1 },
  { compare: true, allow: true, statuses: [403], calls: 1 },
  { compare: true, allow: false, statuses: [200, 403], calls: 2 },
  { compare: true, allow: true, statuses: [200, 200], calls: 2 },
  { compare: true, allow: true, statuses: [200, 429], calls: 2 },
  { compare: true, allow: true, statuses: [200, 403, 403], calls: 3 },
  { compare: true, allow: true, statuses: [200, 403, 409], calls: 3 },
])("bounds diagnostic requests and never retries failures: $statuses", async ({ compare, allow, statuses, calls }) => {
  const request = vi.fn(async () => new Response("{}", { status: statuses.shift()! }));
  await runGraphDiagnostics(compare, allow, () => undefined, async () => "test-token", request);
  expect(request).toHaveBeenCalledTimes(calls);
});
it("downloads signed URLs without an Authorization header", async () => {
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "file", name: "a", eTag: "1", size: 2, "@microsoft.graph.downloadUrl": "https://download.example/file" })))
    .mockResolvedValueOnce(new Response("PK"));
  const client = new GraphClient(async () => "secret", request); await client.download("file", 10);
  expect(request.mock.calls[0][1].headers.Authorization).toBe("Bearer secret");
  expect(request.mock.calls[1][1].headers).toBeUndefined();
});
it("calls the default browser fetch with its global receiver for Graph and signed downloads", async () => {
  const nativeFetch = vi.spyOn(globalThis, "fetch").mockImplementation(async function (this: unknown, input) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    return String(input).startsWith("https://graph.microsoft.com/")
      ? new Response(JSON.stringify({ id: "file", name: "a.epub", eTag: "1", size: 2, "@microsoft.graph.downloadUrl": "https://download.example/a.epub" }))
      : new Response("PK");
  });
  try {
    const { blob } = await new GraphClient(async () => "test-token").download("file", 10);
    expect(await blob.text()).toBe("PK");
    expect(nativeFetch).toHaveBeenCalledTimes(2);
  } finally { nativeFetch.mockRestore(); }
});
it("rescans on descendant cTag change even when the folder eTag is unchanged", async () => {
  const { client, graph, add } = fakeGraph(); add(metaPath, meta); await synchronize(client);
  graph.children.mockClear(); add(metaPath, { ...meta, title: "新标题" }); await synchronize(client);
  expect(graph.children).toHaveBeenCalled();
  expect((await (await database()).get("documents", metaPath))?.data).toHaveProperty("title", "新标题");
});
it("does not substitute folder eTag when cTag is unavailable", async () => {
  const { client, graph, add } = fakeGraph();
  graph.item.mockResolvedValue({ id: "root", name: "BookReaderLibrary", folder: {}, parentReference: { id: "app" }, eTag: "unchanged" });
  add(metaPath, meta); await synchronize(client); graph.children.mockClear(); await synchronize(client);
  expect(graph.children).toHaveBeenCalled();
  expect(await (await database()).get("settings", "inventoryCheckpointV1")).toBeUndefined();
});
it("periodically rescans even if the reported cTag stays unchanged", async () => {
  const { client, graph, add } = fakeGraph(); add(metaPath, meta); await synchronize(client);
  const db = await database(); const checkpoint = await db.get("settings", "inventoryCheckpointV1") as Record<string, unknown>;
  await db.put("settings", { ...checkpoint, scannedAt: Date.now() - 6 * 60 * 1000 }, "inventoryCheckpointV1");
  graph.children.mockClear(); await synchronize(client); expect(graph.children).toHaveBeenCalled();
});
it("does not publish documents or a checkpoint when the cloud changes during download", async () => {
  const { client, graph, add } = fakeGraph(); const db = await database(); add(metaPath, meta);
  graph.item.mockResolvedValueOnce({ id: "root", name: "BookReaderLibrary", folder: {}, eTag: "1", cTag: "before" })
    .mockResolvedValueOnce({ id: "root", name: "BookReaderLibrary", folder: {}, eTag: "1", cTag: "after" });
  await db.put("queue", pending(epubPath, undefined, "file"));
  await expect(synchronize(client)).rejects.toThrow("云端书库发生变化");
  expect(await db.get("documents", metaPath)).toBeUndefined(); expect(await db.count("remote")).toBe(0);
  expect(await db.get("settings", "inventoryCheckpointV1")).toBeUndefined(); expect(await db.count("queue")).toBe(1);
});
it("keeps the previous checkpoint on failed download and retries the change", async () => {
  const { client, graph, add } = fakeGraph(); const db = await database(); add(metaPath, meta); await synchronize(client);
  const before = await db.get("settings", "inventoryCheckpointV1"); add(metaPath, { ...meta, title: "后续内容" });
  graph.download.mockRejectedValueOnce(new GraphError(503, 1));
  await expect(synchronize(client)).rejects.toThrow("503"); expect(await db.get("settings", "inventoryCheckpointV1")).toEqual(before);
  await synchronize(client); expect((await db.get("documents", metaPath))?.data).toHaveProperty("title", "后续内容");
});
it("refuses a same-name file created after inventory and preserves the queue", async () => {
  const { client, graph, add, remote } = fakeGraph(); await writeDocuments([{ path: metaPath, data: meta }]);
  const original = graph.upload.getMockImplementation()!;
  graph.upload.mockImplementationOnce(async (...args) => { add(metaPath, { ...meta, title: "另一端新文件" }); return original(...args); });
  await expect(synchronize(client)).rejects.toThrow("同名文件冲突");
  expect(JSON.parse(await remote.get(metaPath)!.blob.text()).title).toBe("另一端新文件");
  const db = await database(); expect((await db.get("queue", metaPath))?.attempts).toBe(1);
  expect(await db.get("settings", "inventoryCheckpointV1")).toBeUndefined();
  await expect(synchronize(client)).rejects.toThrow("冲突");
});
it("rescans and acknowledges an upload whose successful response was lost", async () => {
  const { client, graph, uploaded } = fakeGraph(); await writeDocuments([{ path: metaPath, data: meta }]);
  const original = graph.upload.getMockImplementation()!;
  graph.upload.mockImplementationOnce(async (...args) => { await original(...args); throw new Error("connection lost"); });
  await expect(synchronize(client)).rejects.toThrow("connection lost");
  expect(await (await database()).get("settings", "inventoryCheckpointV1")).toBeUndefined();
  await synchronize(client); expect(uploaded).toEqual([metaPath]); expect(await (await database()).count("queue")).toBe(0);
});
it("rejects a library root that is no longer a folder", async () => {
  const { client, graph } = fakeGraph();
  graph.item.mockResolvedValue({ id: "root", name: "BookReaderLibrary", file: {}, eTag: "1" });
  await expect(synchronize(client)).rejects.toThrow("原文件夹"); expect(graph.children).not.toHaveBeenCalled();
});
it("uses server-side conflict rejection by default and explicit replacement only when requested", async () => {
  const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: "file", name: "a", eTag: "1" })));
  const client = new GraphClient(async () => "secret", request);
  await client.upload("parent", "a.json", new Blob(["a"]));
  await client.upload("parent", "a.json", new Blob(["b"]), "replace");
  expect(new URL(String(request.mock.calls[0][0])).searchParams.get("@microsoft.graph.conflictBehavior")).toBe("fail");
  expect(new URL(String(request.mock.calls[1][0])).searchParams.get("@microsoft.graph.conflictBehavior")).toBe("replace");
  expect(request.mock.calls[0][1]?.redirect).toBe("error");
});
it.each(["missing", "renamed", "moved"])("does not create a replacement when the pinned library is %s", async (change) => {
  const { client, graph } = fakeGraph(); await synchronize(client); graph.folder.mockClear();
  if (change === "missing") graph.item.mockRejectedValue(new GraphError(404, 60));
  else graph.item.mockResolvedValue({ id: "root", name: change === "renamed" ? "renamed" : "BookReaderLibrary", folder: {}, parentReference: { id: change === "moved" ? "elsewhere" : "app" }, eTag: "1" });
  await expect(synchronize(client)).rejects.toThrow("已停止同步");
  expect(graph.folder).not.toHaveBeenCalled(); expect(graph.upload).not.toHaveBeenCalled();
});
