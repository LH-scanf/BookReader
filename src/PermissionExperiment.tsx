import { useEffect, useState } from "react";
import { authorizeNarrowRetest, authorizeWideExperiment, cleanupExperimentProbe, finishPermissionExperiment,
  preparePermissionExperiment, readPermissionExperiment, runNarrowRetest, runWideExperiment,
  type PermissionExperiment as ExperimentState } from "./sync/permissionExperiment";

export default function PermissionExperiment() {
  const [state, setState] = useState<ExperimentState>(); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [revoked, setRevoked] = useState(false);
  useEffect(() => { void readPermissionExperiment().then(setState); }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await fn(); } catch (error) { setMessage(error instanceof Error ? error.message : "实验未完成，请检查当前阶段"); }
    finally { setState(await readPermissionExperiment()); setBusy(false); }
  };
  return <details><summary>开发期 Files.ReadWrite 临时实验</summary>
    <p>此实验临时授予当前用户文件的读写与删除权限，不限于书库。先关闭其他 BookReader 网页，只保留当前开发页面。第一步会跨刷新/登录回跳锁定正常同步；实验不会运行书库同步。</p>
    <p>阶段：{state?.phase ?? "未开始"}。只有本次固定探针允许清理，不提供图书删除或全盘浏览。</p>
    <div className="settings-actions">
      <button className="secondary-button" disabled={busy || !!state} onClick={() => void run(preparePermissionExperiment)}>1. 锁定同步并准备实验</button>
      <button className="secondary-button" disabled={busy || !state || !["prepared", "broad-consent"].includes(state.phase)} onClick={() => {
        if (window.confirm("确认仅进行临时 Files.ReadWrite 诊断？这会申请用户文件读写与删除权限；实验后必须到微软账号页面撤销授权，不能只删除 Entra 配置。")) void run(authorizeWideExperiment);
      }}>2. 临时授权 Files.ReadWrite</button>
      <button className="secondary-button" disabled={busy || state?.phase !== "broad-consent"} onClick={() => void run(runWideExperiment)}>3. 仅执行一次 GET + PUT</button>
      <button className="secondary-button" disabled={busy || state?.phase !== "broad-done" || !state.probe || state.cleanupUncertain} onClick={() => void run(cleanupExperimentProbe)}>4. 清理本次探针</button>
    </div>
    {state?.cleanupUncertain && <p role="alert">探针写入结果不确定或缺少安全清理信息。请停止并人工核对，不要删除同名旧文件。</p>}
    <p>接着从 Entra 的 API 权限移除临时 Files.ReadWrite，并在 <a href="https://account.live.com/consent/Manage" target="_blank" rel="noreferrer">微软个人账号应用授权管理</a> 中撤销 BookReader 已获授权。若只能整体移除，下一步重新授予 AppFolder 即可。不要清除网站数据。</p>
    <label className="sync-toggle"><input type="checkbox" checked={revoked} disabled={busy} onChange={(event) => setRevoked(event.target.checked)} />我已在微软账号中撤销 BookReader 授权，并移除 Entra 临时 Files.ReadWrite 配置</label>
    <div className="settings-actions">
      <button className="secondary-button" disabled={busy || !revoked || !state || state.phase === "finished" || state.phase === "narrow-done" || !!state.probe || state.cleanupUncertain}
        onClick={() => void run(authorizeNarrowRetest)}>5. 清理登录缓存并仅授权 AppFolder</button>
      <button className="secondary-button" disabled={busy || state?.phase !== "narrow-consent"} onClick={() => void run(runNarrowRetest)}>6. AppFolder-only 复测 GET</button>
      <button className="secondary-button" disabled={busy || state?.phase !== "narrow-done" || state.narrowStatus !== 200} onClick={() => void run(finishPermissionExperiment)}>7. 结束实验（不自动同步）</button>
    </div>
    <p>不会解析 token。复测强制刷新获取 token，并检查 MSAL 范围元数据；仍有宽文件权限则拒绝请求。撤销服务端授权必须由你完成，清理缓存不能替代撤权。</p>
    {state && <textarea aria-label="临时权限实验结果" readOnly rows={14} style={{ width: "100%", boxSizing: "border-box" }} value={JSON.stringify(state, null, 2)} />}
    {message && <p role="status">{message}</p>}
  </details>;
}
