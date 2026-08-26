import { useEffect, useState, useSyncExternalStore } from "react";
import { authConfigured, accountInfo, signIn } from "./auth/microsoft";
import { database, getSetting } from "./storage/database";
import { subscribeLibraryChanges } from "./platform";
import { syncNow, subscribeSync, syncSnapshot } from "./sync/engine";

export default function WebStatus() {
  const status = useSyncExternalStore(subscribeSync, syncSnapshot);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [account, setAccount] = useState(false);
  const [error, setError] = useState("");
  const [offlineReady, setOfflineReady] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  // A retry can start from Settings, not only this component's button.
  useEffect(() => { if (status.phase === "syncing") setError(""); }, [status.phase]);
  useEffect(() => {
    let disposed = false; let cleanup: (() => void) | undefined;
    const refresh = async () => { const count = await (await database()).count("queue"); if (!disposed) setPending(count); };
    const autoSync = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || syncSnapshot().requiresAction || !await getSetting<boolean>("syncEnabled")) return;
      if (await accountInfo()) await syncNow();
    };
    const trigger = () => { void autoSync().catch(() => undefined); };
    const network = () => { setOnline(navigator.onLine); trigger(); };
    const ready = () => setOfflineReady(true);
    const failed = () => setError("离线启动资源尚未缓存完成，请保持联网后重试");
    const available = (event: Event) => setUpdate(() => (event as CustomEvent<() => Promise<void>>).detail);
    void refresh().catch((reason) => setError(String(reason)));
    void subscribeLibraryChanges(() => { void refresh().catch(() => undefined); }).then((fn) => { if (disposed) fn(); else cleanup = fn; });
    void accountInfo().then((value) => { if (!disposed) setAccount(!!value); trigger(); }).catch((reason) => setError(String(reason)));
    window.addEventListener("online", network); window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", trigger);
    window.addEventListener("bookreader-update", available); window.addEventListener("bookreader-offline-ready", ready); window.addEventListener("bookreader-offline-error", failed);
    if (__WEB_BUILD__) void import("./pwa").then(({ installPwa }) => { if (!disposed) installPwa(); });
    const timer = window.setInterval(trigger, 60000);
    return () => { disposed = true; cleanup?.(); clearInterval(timer); window.removeEventListener("online", network); window.removeEventListener("offline", network);
      document.removeEventListener("visibilitychange", trigger); window.removeEventListener("bookreader-update", available); window.removeEventListener("bookreader-offline-ready", ready); window.removeEventListener("bookreader-offline-error", failed); };
  }, []);
  const run = async () => {
    setError("");
    try { if (!account) await signIn(); else await syncNow(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return <>
    <div className="web-status" role="status"><span>{!online ? "离线 · 本机保存" : pending ? `本机已保存 · ${pending} 项待同步` : status.message}</span>
      <button disabled={!online || !authConfigured() || status.phase === "syncing"} onClick={() => void run()}>{account ? "同步" : "登录"}</button></div>
    {(error || status.phase === "error") && <div className="web-notice" role="alert"><span>{error || status.message}</span><button onClick={() => { setError(""); void run(); }}>重试</button></div>}
    {update && <div className="web-notice update-notice"><span>新版本已就绪。请先返回书库保存阅读位置，再更新。</span><button onClick={() => {
      if (document.querySelector(".reader")) { setError("请先返回书库，再更新应用"); return; }
      if (window.confirm("刷新将应用新版本，本机书库与待上传数据会保留。请确认没有未完成的导入。")) void update().catch((reason) => setError(String(reason)));
    }}>更新</button><button onClick={() => setUpdate(null)}>稍后</button></div>}
    {offlineReady && <div className="web-notice"><span>应用已可离线启动；图书仍需先下载。</span><button onClick={() => setOfflineReady(false)}>知道了</button></div>}
  </>;
}
