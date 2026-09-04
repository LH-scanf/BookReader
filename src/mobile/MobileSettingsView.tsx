import { ArrowLeft, ChevronRight, Cloud, Download, Info, Palette, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";

const TrashSettings = lazy(() => import("../TrashSettings"));
const CloudSettings = import.meta.env.DEV ? lazy(() => import("../CloudSettings")) : null;

type Appearance = "light" | "dark";
type Page = "home" | "sync" | "advanced" | "storage" | "trash" | "appearance" | "about" | "updates";
type SyncStatus = { phase: "idle" | "syncing" | "error"; message: string; requiresAction?: boolean };
type SyncInput = { online: boolean; account: boolean; connected: boolean; status: SyncStatus; lastSyncAt: string };
export type MobileSyncState = { kind: "connected" | "syncing" | "offline" | "reconnect" | "disconnected"; label: string; detail: string };

export function resolveMobileSyncState({ online, account, connected, status, lastSyncAt }: SyncInput): MobileSyncState {
  if (!online) return { kind: "offline", label: "离线", detail: "更改将在联网后同步" };
  if (status.phase === "syncing") return { kind: "syncing", label: "正在同步", detail: "正在同步 OneDrive" };
  if (status.phase === "error") return { kind: "reconnect", label: "需要重新连接", detail: "重新连接" };
  if (!account || !connected) return { kind: "disconnected", label: "未连接", detail: "连接 OneDrive" };
  return { kind: "connected", label: "已连接", detail: lastSyncAt ? "已同步" : "已连接" };
}

export function MobileSettingsView({ appearance, onAppearanceChange }: { appearance: Appearance; onAppearanceChange: (value: Appearance) => void }) {
  const [page, setPage] = useState<Page>("home");
  const [name, setName] = useState("");
  const [connected, setConnected] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [libraryUrl, setLibraryUrl] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ phase: "idle", message: "" });

  const refresh = useCallback(() => {
    void Promise.all([import("../auth/microsoft"), import("../storage/database"), import("../sync/engine")])
      .then(async ([auth, storage, sync]) => {
        setConfigured(auth.authConfigured()); setStatus(sync.syncSnapshot());
        const [account, consent, automatic, last, url] = await Promise.all([auth.accountInfo(), storage.getSetting<boolean>("syncConsent"), storage.getSetting<boolean>("syncEnabled"), storage.getSetting<string>("lastSyncAt"), storage.getSetting<string>("libraryWebUrl")]);
        setName(account?.username ?? ""); setConnected(!!consent); setEnabled(!!automatic); setLastSyncAt(last ?? ""); setLibraryUrl(url ?? "");
      })
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : String(reason)));
  }, []);
  useEffect(() => {
    refresh();
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline); window.addEventListener("offline", updateOnline);
    let unlisten: (() => void) | undefined;
    void import("../sync/engine").then((sync) => { const update = () => setStatus(sync.syncSnapshot()); update(); unlisten = sync.subscribeSync(update); });
    return () => { window.removeEventListener("online", updateOnline); window.removeEventListener("offline", updateOnline); unlisten?.(); };
  }, [refresh]);

  const action = async (operation: () => Promise<unknown>) => {
    setBusy(true); setMessage("");
    try { await operation(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); refresh(); }
  };
  const state = resolveMobileSyncState({ online, account: !!name, connected, status, lastSyncAt });
  const connectOrSignIn = () => void action(async () => {
    const [auth, storage, sync] = await Promise.all([import("../auth/microsoft"), import("../storage/database"), import("../sync/engine")]);
    if (!name) return auth.signIn();
    await storage.setSetting("syncConsent", true); await storage.setSetting("syncEnabled", true); await sync.syncNow();
  });

  if (page === "home") return <main className="mobile-settings-page">
    <h1>设置</h1>
    <MobileSettingsGroup title="同步"><SettingsRow icon={<Cloud size={18} />} title="OneDrive" detail={<><SyncDot kind={state.kind} />{state.label}</>} trailing={state.detail} onClick={() => setPage("sync")} /></MobileSettingsGroup>
    <MobileSettingsGroup title="数据与存储"><SettingsRow icon={<Download size={18} />} title="离线图书" onClick={() => setPage("storage")} /><SettingsRow icon={<Trash2 size={18} />} title="回收站" onClick={() => setPage("trash")} /></MobileSettingsGroup>
    <MobileSettingsGroup title="外观"><SettingsRow icon={<Palette size={18} />} title="外观" trailing={appearance === "dark" ? "深色" : "浅色"} onClick={() => setPage("appearance")} /></MobileSettingsGroup>
    <MobileSettingsGroup title="关于"><SettingsRow icon={<RefreshCw size={18} />} title="检查更新" onClick={() => setPage("updates")} /><SettingsRow icon={<Info size={18} />} title="BookReader" onClick={() => setPage("about")} /></MobileSettingsGroup>
  </main>;

  return <main className="mobile-settings-page mobile-settings-subpage">
    <header><button aria-label="返回设置" onClick={() => setPage("home")}><ArrowLeft size={20} /></button><h1>{page === "sync" ? "同步" : page === "advanced" ? "高级同步" : page === "storage" ? "数据与存储" : page === "trash" ? "回收站" : page === "appearance" ? "外观" : page === "updates" ? "检查更新" : "BookReader"}</h1></header>
    {page === "sync" && <section className="mobile-settings-detail"><h2>OneDrive</h2><div className="mobile-settings-status"><span>当前状态</span><strong><SyncDot kind={state.kind} />{state.label}</strong></div>{name && <div className="mobile-settings-status"><span>账号</span><strong>{name}</strong></div>}{name && connected && <button className="mobile-settings-row-button" disabled={busy} onClick={() => void action(async () => { const storage = await import("../storage/database"); await storage.setSetting("syncEnabled", !enabled); })}>自动同步 <span>{enabled ? "已开启" : "已关闭"}</span></button>}<div className="mobile-settings-actions">{(!name || !connected) ? <button className="mobile-settings-primary" disabled={busy || !configured} onClick={connectOrSignIn}>连接 OneDrive</button> : <><button disabled={busy} onClick={() => void action(async () => (await import("../auth/microsoft")).reauthorizeOneDrive())}>重新连接</button><button disabled={busy || !online || status.phase === "syncing"} onClick={() => void action(async () => (await import("../sync/engine")).syncNow())}>{status.phase === "syncing" ? "正在同步…" : "立即同步"}</button></>}</div>{name && <button className="mobile-settings-link" onClick={() => setPage("advanced")}>高级设置 <ChevronRight size={16} /></button>}{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>}
    {page === "advanced" && <section className="mobile-settings-detail"><h2>高级同步</h2><button className="mobile-settings-row-button" disabled={busy} onClick={() => void action(async () => (await import("../auth/microsoft")).reauthorizeOneDrive())}>重新授权 OneDrive <ChevronRight size={16} /></button>{libraryUrl.startsWith("https://") && <a className="mobile-settings-row-button" href={libraryUrl} target="_blank" rel="noreferrer">查看 OneDrive 书库 <ChevronRight size={16} /></a>}{import.meta.env.DEV && CloudSettings && <details className="mobile-settings-dev"><summary>开发诊断</summary><Suspense fallback={<p>正在载入诊断工具…</p>}><CloudSettings /></Suspense></details>}<button className="mobile-settings-danger" disabled={busy} onClick={() => void action(async () => (await import("../auth/microsoft")).signOut())}>退出账号</button>{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>}
    {page === "storage" && <section className="mobile-settings-detail"><h2>离线图书</h2><p>已下载的图书可在无网络时阅读。</p><div className="mobile-settings-storage"><strong><ShieldCheck size={18} />本地数据保护</strong><p>帮助降低系统自动清理 BookReader 数据的可能性。</p><button onClick={() => void action(async () => { const granted = await navigator.storage?.persist?.(); setMessage(granted ? "本地数据保护已开启。" : "暂时无法开启本地数据保护。"); })}>保护本地数据</button></div>{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>}
    {page === "trash" && <Suspense fallback={<p className="mobile-settings-loading">正在读取回收站…</p>}><TrashSettings /></Suspense>}
    {page === "appearance" && <section className="mobile-settings-detail"><div className="mobile-settings-choice"><button aria-pressed={appearance === "light"} onClick={() => onAppearanceChange("light")}><span>浅色</span>{appearance === "light" && <b>●</b>}</button><button aria-pressed={appearance === "dark"} onClick={() => onAppearanceChange("dark")}><span>深色</span>{appearance === "dark" && <b>●</b>}</button></div><p>阅读页的明亮、纸张和夜间主题在 Aa 中单独设置。</p></section>}
    {page === "updates" && <MobileUpdatePage />}
    {page === "about" && <section className="mobile-settings-detail mobile-settings-about"><h2>BookReader</h2><p>私人 EPUB 阅读器</p></section>}
  </main>;
}

function MobileUpdatePage() { const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [update, setUpdate] = useState<(() => Promise<void>) | null>(null); useEffect(() => { let unsubscribe: (() => void) | undefined; void import("../pwa-update").then((pwa) => { const refresh = () => setUpdate(pwa.getAvailablePwaUpdate()); refresh(); unsubscribe = pwa.subscribePwaUpdate(refresh); }); return () => unsubscribe?.(); }, []); const check = async () => { setBusy(true); setMessage(""); try { const { requestPwaUpdateCheck } = await import("../pwa-update"); await requestPwaUpdateCheck(); setMessage("已检查更新；如有新版本会显示更新选项。"); } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); } }; const apply = async () => { if (!update) return; setBusy(true); setMessage(""); try { await update(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setBusy(false); } }; return <section className="mobile-settings-detail"><p>{update ? "发现新版本，更新会重新加载应用，本机书库与待同步数据会保留。" : "前台联网时会检查应用更新。"}</p><button className="mobile-settings-primary" disabled={busy} onClick={() => void (update ? apply() : check())}>{busy ? "正在处理…" : update ? "更新" : "检查更新"}</button>{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>; }
function MobileSettingsGroup({ title, children }: { title: string; children: ReactNode }) { return <section className="mobile-settings-group"><h2>{title}</h2><div>{children}</div></section>; }
function SettingsRow({ icon, title, detail, trailing, onClick }: { icon: ReactNode; title: string; detail?: ReactNode; trailing?: string; onClick: () => void }) { return <button className="mobile-settings-row" onClick={onClick}><span className="mobile-settings-row-icon">{icon}</span><span className="mobile-settings-row-copy"><strong>{title}</strong>{detail && <small>{detail}</small>}</span>{trailing && <small className="mobile-settings-row-trailing">{trailing}</small>}<ChevronRight size={17} /></button>; }
function SyncDot({ kind }: { kind: MobileSyncState["kind"] }) { return <i className={`mobile-sync-dot ${kind}`} aria-hidden="true" />; }
