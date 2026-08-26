import { microsoftClient, requireAccount } from "../auth/microsoft";
import { getSetting, setSetting } from "../storage/database";
import { GraphClient, GraphError, type DriveItem, type GraphTrace } from "./graph";
import { EXPERIMENT_PAUSE, pauseForPermissionExperiment } from "./experimentGate";

const KEY = "permissionExperiment";
const ROOT = "/me/drive/special/approot";
const NAME = "__bookreader_probe.txt";
type Phase = "prepared" | "broad-consent" | "broad-done" | "narrow-consent" | "narrow-done" | "finished";
export type PermissionExperiment = {
  phase: Phase; records: Array<GraphTrace & { step: string }>;
  broadScopes?: string[]; narrowScopes?: string[];
  probe?: { id: string; eTag: string }; cleanupUncertain?: boolean;
  narrowStatus?: number; note?: string;
};
export const readPermissionExperiment = () => getSetting<PermissionExperiment>(KEY);
function devOnly() { if (!import.meta.env.DEV) throw new Error("权限实验仅限开发环境"); }
async function locked<T>(fn: (state: PermissionExperiment) => Promise<T>) {
  devOnly();
  if (!navigator.locks) throw new Error("缺少同步锁");
  return navigator.locks.request("bookreader-sync", async () => {
    if (!await getSetting<boolean>(EXPERIMENT_PAUSE)) throw new Error("必须先锁定正常同步");
    const state = await readPermissionExperiment();
    if (!state || state.phase === "finished") throw new Error("没有待完成的权限实验");
    await requireAccount(); // Preserve the existing local-library account binding.
    return fn(state);
  });
}
export async function preparePermissionExperiment() {
  devOnly();
  if (await readPermissionExperiment()) throw new Error("本次实验已经准备过；请继续现有步骤，不重复创建实验");
  await pauseForPermissionExperiment();
  await requireAccount();
  await setSetting(KEY, { phase: "prepared", records: [] } satisfies PermissionExperiment);
}
export async function authorizeWideExperiment() {
  await locked(async (state) => {
    if (!["prepared", "broad-consent"].includes(state.phase)) throw new Error("宽权限实验已经执行，不能重复授权");
    state.phase = "broad-consent"; await setSetting(KEY, state);
    await (await microsoftClient()).loginRedirect({ scopes: ["Files.ReadWrite"], prompt: "consent" });
  });
}
async function experimentToken(scope: "Files.ReadWrite" | "Files.ReadWrite.AppFolder") {
  const client = await microsoftClient(); const account = await requireAccount();
  const result = await client.acquireTokenSilent({ scopes: [scope], account, forceRefresh: true });
  const granted = result.scopes.map((item) => item.toLowerCase().replace(/^https:\/\/graph\.microsoft\.com\//, ""));
  const allowed = scope === "Files.ReadWrite" ? ["files.readwrite", "files.readwrite.appfolder"] : ["files.readwrite.appfolder"];
  if (!granted.includes(scope.toLowerCase()) || granted.some((item) =>
    (item.startsWith("files.") && !allowed.includes(item)) || item.startsWith("sites."))) {
    throw new Error("MSAL 返回的文件权限范围不符合本步骤，已停止 Graph 请求；请核对撤权和重新授权状态");
  }
  return { token: result.accessToken, scopes: result.scopes };
}
function clientFor(token: string, state: PermissionExperiment, step: () => string) {
  return new GraphClient(async () => token, globalThis.fetch.bind(globalThis), (trace) => {
    const record = { step: step(), ...trace }; state.records.push(record);
    console.info("BookReader permission experiment", record);
  });
}
export async function runWideExperiment() {
  await locked(async (state) => {
    if (state.phase !== "broad-consent") throw new Error("请先完成临时宽权限授权；读写实验只允许执行一次");
    const auth = await experimentToken("Files.ReadWrite");
    state.broadScopes = auth.scopes; state.phase = "broad-done";
    await setSetting(KEY, state); // One-shot even after navigation or lost responses.
    let step = "Files.ReadWrite: GET approot";
    const graph = clientFor(auth.token, state, () => step);
    try {
      try { await graph.json(ROOT); }
      catch (error) { if (!(error instanceof GraphError) || error.status !== 403) throw error; }
      step = "Files.ReadWrite: PUT probe (conflict=fail)";
      state.cleanupUncertain = true; await setSetting(KEY, state);
      let probe: DriveItem;
      try {
        probe = await graph.json<DriveItem>(`${ROOT}:/${NAME}:/content?@microsoft.graph.conflictBehavior=fail`, {
          method: "PUT", headers: { "Content-Type": "text/plain" }, body: "BookReader probe",
        });
      } catch (error) {
        if (error instanceof GraphError && [400, 401, 403, 404, 409, 412, 413, 429].includes(error.status)) state.cleanupUncertain = false;
        throw error;
      }
      if (probe.name !== NAME || !probe.file || !probe.id || !probe.eTag) throw new Error("探针响应缺少安全清理所需信息，请手动核对；不自动删除任何文件");
      state.probe = { id: probe.id, eTag: probe.eTag }; state.cleanupUncertain = false;
    } finally { await setSetting(KEY, state); }
  });
}
export async function cleanupExperimentProbe() {
  await locked(async (state) => {
    if (state.phase !== "broad-done" || !state.probe || state.cleanupUncertain) throw new Error("没有可安全自动清理的本次探针；不会删除同名旧文件");
    const auth = await experimentToken("Files.ReadWrite");
    const graph = clientFor(auth.token, state, () => "Files.ReadWrite: DELETE own probe (If-Match)");
    try {
      await graph.json(`/me/drive/items/${encodeURIComponent(state.probe.id)}`, { method: "DELETE", headers: { "If-Match": state.probe.eTag } });
      delete state.probe;
    } finally { await setSetting(KEY, state); }
  });
}
// Called only after the user confirms removing consent on Microsoft's account page.
export async function authorizeNarrowRetest() {
  await locked(async (state) => {
    if (!["prepared", "broad-consent", "broad-done", "narrow-consent"].includes(state.phase)) throw new Error("当前阶段不能重复复测授权");
    if (state.probe || state.cleanupUncertain) throw new Error("先清理或人工核对本次探针，再撤权复测");
    const client = await microsoftClient(); const account = await requireAccount();
    state.phase = "narrow-consent"; await setSetting(KEY, state);
    await client.clearCache({ account }); // Only MSAL cache; never clear site data/EPUB/queue.
    await client.loginRedirect({ scopes: ["Files.ReadWrite.AppFolder"], prompt: "consent" });
  });
}
export async function runNarrowRetest() {
  await locked(async (state) => {
    if (state.phase !== "narrow-consent") throw new Error("请先撤销宽权限并重新完成 AppFolder 授权");
    const auth = await experimentToken("Files.ReadWrite.AppFolder");
    state.narrowScopes = auth.scopes; state.phase = "narrow-done";
    await setSetting(KEY, state);
    const graph = clientFor(auth.token, state, () => "AppFolder-only: GET approot after revocation");
    try { await graph.json(ROOT); state.narrowStatus = 200; }
    catch (error) { if (error instanceof GraphError) state.narrowStatus = error.status; throw error; }
    finally { await setSetting(KEY, state); }
  });
}
export async function finishPermissionExperiment() {
  await locked(async (state) => {
    if (state.phase !== "narrow-done" || state.narrowStatus !== 200 || state.probe || state.cleanupUncertain) throw new Error("尚未通过 AppFolder-only 复测，正常同步继续锁定");
    // Check fresh scope metadata again, but do not make any Graph/sync request.
    await experimentToken("Files.ReadWrite.AppFolder");
    state.phase = "finished"; await setSetting(KEY, state);
    await setSetting("syncEnabled", false); await setSetting(EXPERIMENT_PAUSE, false);
    window.dispatchEvent(new Event("bookreader-permission-experiment"));
  });
}
