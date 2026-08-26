import { getSetting, setSetting } from "../storage/database";

export const EXPERIMENT_PAUSE = "permissionExperimentPaused";
export async function assertSyncAllowed() {
  if (await getSetting<boolean>(EXPERIMENT_PAUSE)) throw new Error("权限诊断实验进行中，正常同步已锁定；请完成撤权和 AppFolder-only 复测后再解除");
}
export async function pauseForPermissionExperiment() {
  if (!import.meta.env.DEV) throw new Error("权限实验仅限开发环境");
  if (!navigator.locks) throw new Error("浏览器缺少同步锁，不能安全开始实验");
  // Persist before waiting: new/queued syncs cannot start; an existing one must finish first.
  await setSetting(EXPERIMENT_PAUSE, true);
  await setSetting("syncEnabled", false);
  window.dispatchEvent(new Event("bookreader-permission-experiment"));
  await navigator.locks.request("bookreader-sync", async () => undefined);
}
