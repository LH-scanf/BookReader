import { useEffect, useState, useSyncExternalStore } from "react";
import { authConfigured, accountInfo, signIn } from "./auth/microsoft";
import { database, getSetting } from "./storage/database";
import { subscribeLibraryChanges } from "./platform";
import { syncNow, subscribeSync, syncSnapshot } from "./sync/engine";
import { EXPERIMENT_PAUSE } from "./sync/experimentGate";
import { useUiMode } from "./ui/ui-mode";

export default function WebStatus() {
  const uiMode = useUiMode();
  const status = useSyncExternalStore(subscribeSync, syncSnapshot);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [account, setAccount] = useState(false);
  const [experimentPaused, setExperimentPaused] = useState(false);
  const [error, setError] = useState("");
  const [offlineReady, setOfflineReady] = useState(false);
  // A retry can start from Settings, not only this component's button.
  useEffect(() => { if (status.phase === "syncing") setError(""); }, [status.phase]);
  useEffect(() => {
    let disposed = false; let cleanup: (() => void) | undefined;
    const refresh = async () => {
      const count = await (await database()).count("queue"); const paused = await getSetting<boolean>(EXPERIMENT_PAUSE);
      if (!disposed) { setPending(count); setExperimentPaused(!!paused); }
    };
    const experimentChanged = () => { void refresh().catch(() => undefined); };
    const network = () => setOnline(navigator.onLine);
    const ready = () => setOfflineReady(true);
    const failed = () => setError("离线启动资源尚未缓存完成，请保持联网后重试");
    void refresh().catch((reason) => setError(String(reason)));
    void subscribeLibraryChanges(() => { void refresh().catch(() => undefined); }).then((fn) => { if (disposed) fn(); else cleanup = fn; });
    void accountInfo().then((value) => { if (!disposed) setAccount(!!value); }).catch((reason) => setError(String(reason)));
    window.addEventListener("online", network); window.addEventListener("offline", network);
    window.addEventListener("bookreader-permission-experiment", experimentChanged);
    window.addEventListener("bookreader-offline-ready", ready); window.addEventListener("bookreader-offline-error", failed);
    if (__WEB_BUILD__) void import("./pwa").then(({ installPwa }) => { if (!disposed) installPwa(); });
    return () => { disposed = true; cleanup?.(); window.removeEventListener("online", network); window.removeEventListener("offline", network);
      window.removeEventListener("bookreader-permission-experiment", experimentChanged);
      window.removeEventListener("bookreader-offline-ready", ready); window.removeEventListener("bookreader-offline-error", failed); };
  }, []);
  const run = async () => {
    setError("");
    try { if (!account) await signIn(); else await syncNow(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const noticeClassName = uiMode === "mobile" ? "web-notice web-notice-mobile" : "web-notice";
  return <>
    {uiMode === "desktop" && <div className="web-status" role="status"><span>{experimentPaused ? "权限诊断实验中 · 正常同步已锁定" : !online ? "离线 · 本机保存" : pending ? `本机已保存 · ${pending} 项待同步` : status.message}</span>
      <button disabled={experimentPaused || !online || !authConfigured() || status.phase === "syncing"} onClick={() => void run()}>{account ? "同步" : "登录"}</button></div>}
    {!experimentPaused && (error || status.phase === "error") && <div className={noticeClassName} role="alert"><span>{error || status.message}</span><button onClick={() => { setError(""); void run(); }}>重试</button></div>}
    {offlineReady && <div className={noticeClassName}><span>应用已可离线启动；图书仍需先下载。</span><button onClick={() => setOfflineReady(false)}>知道了</button></div>}
  </>;
}
