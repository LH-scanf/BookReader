import { accessToken } from "../auth/microsoft";

const BASE = "https://graph.microsoft.com/v1.0";
export type DriveItem = { id: string; name: string; eTag: string; cTag?: string; size?: number; folder?: object; file?: { mimeType?: string }; parentReference?: { id?: string }; webUrl?: string; "@microsoft.graph.downloadUrl"?: string };
type GraphDiagnostic = { operation: string; code?: string; detail?: string; requestId?: string };
export class GraphError extends Error {
  constructor(public status: number, public retryAfter: number, public diagnostic?: GraphDiagnostic) {
    super((status === 429 ? `OneDrive 请求过多，请稍后重试（${retryAfter} 秒）` : `OneDrive 请求失败（HTTP ${status}），本机数据已保留`)
      + (diagnostic ? `。步骤：${diagnostic.operation}${diagnostic.code ? `；代码：${diagnostic.code}` : ""}${diagnostic.detail ? `；说明：${diagnostic.detail}` : ""}${diagnostic.requestId ? `；请求编号：${diagnostic.requestId}` : ""}` : ""));
  }
}
function safeErrorText(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value.replace(/https?:\/\/\S+/gi, "[链接已省略]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[账号已省略]")
    .replace(/Bearer\s+\S+/gi, "[凭证已省略]").replace(/[A-Za-z0-9_\-+/=]{64,}/g, "[长标识已省略]")
    .replace(/[\r\n\t]+/g, " ").slice(0, 350);
}
async function responseError(response: Response, operation: string) {
  let error: { code?: unknown; message?: unknown; innerError?: { code?: unknown } } | undefined;
  // Surface only selected, redacted fields; never log response bodies or auth data.
  const reader = response.body?.getReader();
  if (reader) {
    try {
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 16384) break; chunks.push(chunk.value); }
      if (size <= 16384) error = (JSON.parse(await new Blob(chunks).text()) as { error?: typeof error }).error;
    } catch { /* Some Graph errors contain HTML or an empty body. */ }
    finally { await reader.cancel().catch(() => undefined); }
  }
  const codes = [error?.code, error?.innerError?.code].filter((value): value is string => typeof value === "string" && /^[\w.-]{1,80}$/.test(value));
  const id = response.headers.get("request-id");
  return new GraphError(response.status, Number(response.headers.get("Retry-After")) || 60, {
    operation, code: codes.length ? codes.join(" / ") : undefined, detail: safeErrorText(error?.message),
    requestId: id && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined,
  });
}
function operationName(path: string, method = "GET") {
  if (path.endsWith("/special/approot")) return "访问应用专用目录";
  if (path.endsWith("/children")) return method === "POST" ? "创建书库目录" : "读取目录内容";
  if (path.endsWith("/content")) return "上传书库文件";
  return "读取云端文件信息";
}
export class GraphClient {
  // A browser's native fetch requires the global receiver, not this GraphClient.
  constructor(private token = accessToken, private request: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = path.startsWith("https:") ? new URL(path) : new URL(`${BASE}${path}`);
    if (url.origin !== "https://graph.microsoft.com" || !url.pathname.startsWith("/v1.0/")) throw new Error("拒绝不受信任的 Graph 地址");
    const response = await this.request(url.href, { ...init, redirect: "error", signal: AbortSignal.timeout(60000),
      headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${await this.token()}` } });
    if (!response.ok) throw await responseError(response, operationName(url.pathname, init.method));
    return response.json() as Promise<T>;
  }
  async children(id: string) {
    const result: DriveItem[] = []; let path: string | undefined = `/me/drive/items/${encodeURIComponent(id)}/children?$top=200`;
    const visited = new Set<string>();
    while (path) {
      if (visited.has(path)) throw new Error("OneDrive 返回重复分页地址"); visited.add(path);
      const page: { value: DriveItem[]; "@odata.nextLink"?: string } = await this.json(path);
      if (!Array.isArray(page.value)) throw new Error("OneDrive 目录响应无效");
      result.push(...page.value); path = page["@odata.nextLink"];
    }
    return result;
  }
  async folder(parentId: string, name: string): Promise<DriveItem> {
    const existing = (await this.children(parentId)).find((item) => item.name === name);
    if (existing) { if (!existing.folder) throw new Error(`云端 ${name} 不是文件夹`); return existing; }
    try { return await this.json(`/me/drive/items/${encodeURIComponent(parentId)}/children`, {
      method: "POST", body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    }); } catch (error) {
      if (error instanceof GraphError && error.status === 409) {
        const concurrent = (await this.children(parentId)).find((item) => item.name === name && item.folder);
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }
  async item(id: string) { return this.json<DriveItem>(`/me/drive/items/${encodeURIComponent(id)}`); }
  async download(id: string, maxBytes: number): Promise<{ blob: Blob; item: DriveItem }> {
    const item = await this.item(id); const url = item["@microsoft.graph.downloadUrl"];
    if (!url || new URL(url).protocol !== "https:") throw new Error("OneDrive 未返回安全下载地址");
    if ((item.size ?? 0) > maxBytes) throw new Error("文件超过本版支持的大小上限");
    // Preauthenticated download URLs must never receive the Graph bearer token.
    const response = await this.request(url, { signal: AbortSignal.timeout(120000), credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw await responseError(response, "下载云端文件");
    if (Number(response.headers.get("Content-Length")) > maxBytes) throw new Error("下载文件超过大小上限");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("浏览器不支持流式下载");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength;
        if (size > maxBytes) throw new Error("下载文件超过大小上限"); chunks.push(chunk.value); }
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    if (item.size !== undefined && size !== item.size) throw new Error("下载未完成，未写入缓存");
    return { blob: new Blob(chunks, { type: item.file?.mimeType ?? "application/octet-stream" }), item };
  }
  async upload(parentId: string, name: string, blob: Blob, conflict: "fail" | "replace" = "fail"): Promise<DriveItem> {
    // Each writable shared object is immutable (lifecycle/import) or owned by this device (progress).
    // Small JSON and bounded EPUB files use PUT; the import marker is sent last by the engine.
    return this.json(`/me/drive/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=${conflict}`, {
      method: "PUT", body: blob, headers: { "Content-Type": blob.type || "application/octet-stream" },
    });
  }
}
