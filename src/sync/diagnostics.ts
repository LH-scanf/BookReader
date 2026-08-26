import { accessToken, diagnosticAccessToken } from "../auth/microsoft";
import { GraphClient, GraphError, type GraphTrace } from "./graph";

export type DiagnosticEntry = GraphTrace & { step: string };
const APP_ROOT = "/me/drive/special/approot";
const PROBE = `${APP_ROOT}:/__bookreader_probe.txt:/content?@microsoft.graph.conflictBehavior=fail`;

// Manual diagnostics only: no sync queue, book changes, retries or token persistence.
export async function runGraphDiagnostics(compareIdentity: boolean, allowProbe: boolean,
  emit: (entry: DiagnosticEntry) => void,
  getToken = compareIdentity ? diagnosticAccessToken : accessToken,
  request: typeof fetch = globalThis.fetch.bind(globalThis)) {
  const token = await getToken(); // Exactly one opaque token for every request in this run.
  let step = "";
  const graph = new GraphClient(async () => token, request, (trace) => emit({ step, ...trace }));
  const attempt = async (label: string, path: string, init?: RequestInit) => {
    step = label;
    try { await graph.json(path, init); return 200; }
    catch (error) { if (error instanceof GraphError) return error.status; throw error; }
  };
  if (compareIdentity && await attempt("GET /me（仅记录状态，不记录个人资料）", "/me") !== 200) return;
  const rootStatus = await attempt("GET approot", APP_ROOT);
  // Do not attempt a write for auth failures, throttling, outages or a healthy root.
  if (!compareIdentity || !allowProbe || rootStatus !== 403) return;
  const probeStatus = await attempt("PUT __bookreader_probe.txt（同名则失败）", PROBE, {
    method: "PUT", body: "BookReader probe", headers: { "Content-Type": "text/plain" },
  });
  if (probeStatus === 200) await attempt("GET approot（探针写入后）", APP_ROOT);
}
