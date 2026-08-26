import { lazy, Suspense, useEffect, useState } from "react";
import { accountInfo, authConfigured, authorizeGraphDiagnostics, reauthorizeOneDrive, signIn, signOut } from "./auth/microsoft";
import { getSetting, setSetting } from "./storage/database";
import { syncNow } from "./sync/engine";
import { runGraphDiagnostics, type DiagnosticEntry } from "./sync/diagnostics";
import { assertSyncAllowed, EXPERIMENT_PAUSE } from "./sync/experimentGate";

const PermissionExperiment = import.meta.env.DEV ? lazy(() => import("./PermissionExperiment")) : null;

export default function CloudSettings() {
  const [name, setName] = useState(""); const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [storage, setStorage] = useState(""); const [url, setUrl] = useState("");
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [allowProbe, setAllowProbe] = useState(false);
  const [experimentPaused, setExperimentPaused] = useState(false);
  useEffect(() => {
    const refreshExperiment = () => {
      void getSetting<boolean>(EXPERIMENT_PAUSE).then((value) => setExperimentPaused(!!value));
      void getSetting<boolean>("syncEnabled").then((value) => setEnabled(!!value));
    };
    refreshExperiment(); window.addEventListener("bookreader-permission-experiment", refreshExperiment);
    void accountInfo().then((account) => setName(account?.username ?? "")).catch((error) => setMessage(String(error)));
    void getSetting<boolean>("syncEnabled").then((value) => setEnabled(!!value));
    void getSetting<boolean>("syncConsent").then((value) => setConnected(!!value));
    void getSetting<string>("libraryWebUrl").then((value) => setUrl(value ?? ""));
    void navigator.storage?.estimate?.().then((estimate) => setStorage(`本机站点已用约 ${Math.round((estimate.usage ?? 0) / 1024 / 1024)} MB`));
    return () => window.removeEventListener("bookreader-permission-experiment", refreshExperiment);
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
      {name && <><button className="primary-button" disabled={busy || experimentPaused} onClick={() => void action(async () => {
        await assertSyncAllowed();
        if (!await getSetting<boolean>("syncConsent") && !window.confirm("连接当前微软账号的应用专用目录并创建 BookReaderLibrary（若不存在）？本机图书、阅读进度和删除/恢复记录将同步到此目录，并启用前台自动同步。")) return;
        await setSetting("syncConsent", true); setConnected(true);
        await setSetting("syncEnabled", true); setEnabled(true); await syncNow();
      })}>{busy ? "处理中…" : "连接并同步书库"}</button>
      <button className="secondary-button" disabled={busy} onClick={() => void action(reauthorizeOneDrive)}>重新授权 OneDrive</button>
      <button className="quiet-button" disabled={busy} onClick={() => void action(async () => {
        await setSetting("syncEnabled", false); setEnabled(false);
        if (window.confirm("退出微软登录？本机文件和待上传数据保留，仍绑定原账号。")) await signOut();
      })}>退出登录</button></>}
    </div>
    {name && <p>遇到授权错误时，可点击“重新授权 OneDrive”，使用原账号确认应用专用目录权限。本机数据保留，不申请全盘访问。</p>}
    {experimentPaused && <p role="status">权限实验保护已启用：自动和手动同步均锁定，刷新或登录回跳不会解除。</p>}
    <label className="sync-toggle"><input type="checkbox" checked={enabled} disabled={busy || !name || !connected || experimentPaused} onChange={(event) => {
      const value = event.target.checked; void action(async () => { await setSetting("syncEnabled", value); setEnabled(value); });
    }} />应用在前台时自动同步</label>
    {url.startsWith("https://") && <p><a href={url} target="_blank" rel="noreferrer">查看 OneDrive 书库目录</a></p>}
    {name && !experimentPaused && <details><summary>OneDrive 诊断（不扩大文件权限）</summary>
      <p>先读取错误详情；再用同一个 token 对照 /me 与 approot。User.Read 仅用于身份对照，普通同步仍只请求 AppFolder。诊断不上传书库、不记录个人资料或令牌。</p>
      <div className="settings-actions">
        <button className="secondary-button" disabled={busy} onClick={() => void action(async () => {
          setDiagnostics([]);
          await runGraphDiagnostics(false, false, (entry) => { setDiagnostics((items) => [...items, entry]); console.info("BookReader Graph diagnostic", entry); });
        })}>读取 AppFolder 错误详情</button>
        <button className="secondary-button" disabled={busy} onClick={() => void action(authorizeGraphDiagnostics)}>授权身份对照诊断</button>
        <button className="secondary-button" disabled={busy} onClick={() => void action(async () => {
          setDiagnostics([]);
          await runGraphDiagnostics(true, allowProbe, (entry) => { setDiagnostics((items) => [...items, entry]); console.info("BookReader Graph diagnostic", entry); });
        })}>运行同 token 对照</button>
      </div>
      <label className="sync-toggle"><input type="checkbox" checked={allowProbe} disabled={busy} onChange={(event) => setAllowProbe(event.target.checked)} />
        允许身份验证成功且目录返回 403 后，在应用目录写入 __bookreader_probe.txt（同名则失败，不自动删除）</label>
      <p>只输出脱敏后的错误对象及请求元数据。date 为服务端响应头，observedAt 为本机 UTC 时间；null 表示浏览器未能取得该响应头。结果仅保留在当前页面。</p>
      {diagnostics.length > 0 && <textarea aria-label="Graph 诊断结果" readOnly rows={18}
        style={{ width: "100%", boxSizing: "border-box" }} value={JSON.stringify(diagnostics, null, 2)} />}
    </details>}
    {PermissionExperiment && <Suspense fallback={<p>正在载入诊断工具…</p>}><PermissionExperiment /></Suspense>}
    <p>{storage}。系统可能清理网站数据；待上传内容不等于云端备份。</p>
    <button className="secondary-button" onClick={() => void action(async () => {
      const granted = await navigator.storage?.persist?.(); setMessage(granted ? "浏览器已允许持久存储。请仍保留云端备份。" : "浏览器暂未授予持久存储，请添加到主屏幕并定期同步。");
    })}>申请保留本机数据</button>
    <p>iPhone：Safari 分享 → 添加到主屏幕。首次需联网加载，下载后的图书可离线阅读。</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
