import { useEffect, useState } from "react";
import { accountInfo, authConfigured, signIn, signOut } from "./auth/microsoft";
import { getSetting, setSetting } from "./storage/database";
import { syncNow } from "./sync/engine";

export default function CloudSettings() {
  const [name, setName] = useState(""); const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [storage, setStorage] = useState(""); const [url, setUrl] = useState("");
  useEffect(() => {
    void accountInfo().then((account) => setName(account?.username ?? "")).catch((error) => setMessage(String(error)));
    void getSetting<boolean>("syncEnabled").then((value) => setEnabled(!!value));
    void getSetting<string>("libraryWebUrl").then((value) => setUrl(value ?? ""));
    void navigator.storage?.estimate?.().then((estimate) => setStorage(`本机站点已用约 ${Math.round((estimate.usage ?? 0) / 1024 / 1024)} MB`));
  }, []);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true); setMessage(""); try { await fn(); setUrl(await getSetting<string>("libraryWebUrl") ?? ""); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };
  return <section className="settings-card cloud-settings"><h2>OneDrive 同步</h2>
    <p>{name || "未登录。现在导入的书和阅读位置仅保存在本机。"}</p>
    {!authConfigured() && <p>开发配置尚未填写微软 SPA Client ID。请参照项目部署文档配置；本地阅读无需登录。</p>}
    <p>使用个人 OneDrive 应用专用目录。首次连接会建立 BookReaderLibrary；本机书库将绑定该微软账号。</p>
    <div className="settings-actions"><button className="secondary-button" disabled={busy || !authConfigured()} onClick={() => void action(signIn)}>{name ? "重新登录" : "登录微软账号"}</button>
      {name && <><button className="primary-button" disabled={busy} onClick={() => void action(async () => {
        if (!enabled && !window.confirm("将本机图书、阅读进度和删除/恢复记录同步到当前微软账号的应用专用目录？")) return;
        await setSetting("syncEnabled", true); setEnabled(true); await syncNow();
      })}>{busy ? "处理中…" : "连接并同步书库"}</button>
      <button className="quiet-button" disabled={busy} onClick={() => void action(async () => {
        await setSetting("syncEnabled", false); setEnabled(false);
        if (window.confirm("退出微软登录？本机文件和待上传数据保留，仍绑定原账号。")) await signOut();
      })}>退出登录</button></>}
    </div>
    <label className="sync-toggle"><input type="checkbox" checked={enabled} disabled={busy || !name} onChange={(event) => {
      const value = event.target.checked; void action(async () => { await setSetting("syncEnabled", value); setEnabled(value); });
    }} />应用在前台时自动同步</label>
    {url.startsWith("https://") && <p><a href={url} target="_blank" rel="noreferrer">查看 OneDrive 书库目录</a></p>}
    <p>{storage}。系统可能清理网站数据；待上传内容不等于云端备份。</p>
    <button className="secondary-button" onClick={() => void action(async () => {
      const granted = await navigator.storage?.persist?.(); setMessage(granted ? "浏览器已允许持久存储。请仍保留云端备份。" : "浏览器暂未授予持久存储，请添加到主屏幕并定期同步。");
    })}>申请保留本机数据</button>
    <p>iPhone：Safari 分享 → 添加到主屏幕。首次需联网加载，下载后的图书可离线阅读。</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
