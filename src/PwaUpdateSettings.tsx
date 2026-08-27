import { useState, useSyncExternalStore } from "react";
import { getAvailablePwaUpdate, requestPwaUpdateCheck, subscribePwaUpdate } from "./pwa-update";

export default function PwaUpdateSettings() {
  const update = useSyncExternalStore(subscribePwaUpdate, getAvailablePwaUpdate, getAvailablePwaUpdate);
  const [busy, setBusy] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [message, setMessage] = useState("");

  const apply = async () => {
    if (!update) return;
    setBusy(true); setMessage("");
    try { await update(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setMessage("");
    try {
      await requestPwaUpdateCheck();
      setMessage("已检查更新；若有新版，稍候会显示更新选项。");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  };

  return <section className="settings-card update-settings">
    <h2>应用更新</h2>
    {update && !deferred ? <>
      <p>发现新版本。更新会重新加载应用，本机书库和待同步数据会保留。</p>
      <div className="settings-actions"><button className="primary-button" disabled={busy} onClick={() => void apply()}>{busy ? "正在更新…" : "更新"}</button><button className="secondary-button" disabled={busy} onClick={() => setDeferred(true)}>等等再说</button></div>
    </> : update ? <>
      <p>已有新版本，已暂缓更新。下次打开“设置”时会再次提醒。</p>
      <div className="settings-actions"><button className="secondary-button" onClick={() => setDeferred(false)}>查看更新选项</button></div>
    </> : <>
      <p>当前未发现新版本。iPhone 主屏幕版会在前台联网时检查更新。</p>
      <div className="settings-actions"><button className="secondary-button" disabled={busy} onClick={() => void check()}>{busy ? "正在检查…" : "检查更新"}</button></div>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
