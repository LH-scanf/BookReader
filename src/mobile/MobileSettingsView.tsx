import { ArrowLeft, ChevronRight, Cloud, Download, Info, Palette, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";

const TrashSettings = lazy(() => import("../TrashSettings"));
const CloudSettings = import.meta.env.DEV ? lazy(() => import("../CloudSettings")) : null;

type Appearance = "light" | "dark";
type Page = "home" | "sync" | "conflict" | "advanced" | "storage" | "trash" | "appearance" | "about" | "updates";
const parentPage: Partial<Record<Page, Page>> = { sync: "home", conflict: "sync", advanced: "sync", storage: "home", trash: "home", appearance: "home", updates: "home", about: "home" };
type SyncStatus = { phase: "idle" | "syncing" | "error"; message: string; requiresAction?: boolean; conflict?: { path: string; kind: "annotation" | "book-note" } };
type SyncConflictDetail = { path: string; kind: "annotation" | "book-note"; bookTitle: string; local: ConflictVersion; remote: ConflictVersion };
type ConflictVersion = { quote?: string; reflection?: string; chapterTitle?: string; updatedAt?: string; deletedAt?: string | null; summary?: string };
type SyncInput = { online: boolean; account: boolean; connected: boolean; status: SyncStatus; lastSyncAt: string };
export type MobileSyncState = { kind: "connected" | "syncing" | "offline" | "reconnect" | "disconnected"; label: string; detail: string };
export const mobileSettingsParentPage = (page: Page): Page => parentPage[page] ?? "home";

export function resolveMobileSyncState({ online, account, connected, status, lastSyncAt }: SyncInput): MobileSyncState {
  if (!online) return { kind: "offline", label: "离线", detail: "更改将在联网后同步" };
  if (status.phase === "syncing") return { kind: "syncing", label: "正在同步", detail: "正在同步 OneDrive" };
  if (status.conflict) return { kind: "reconnect", label: "需要处理", detail: "处理冲突" };
  if (status.requiresAction) return { kind: "reconnect", label: "需要重新连接", detail: "重新连接" };
  if (status.phase === "error") return { kind: "connected", label: "暂时无法同步", detail: "稍后重试" };
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
  const [conflict, setConflict] = useState<SyncConflictDetail | null>(null);
  const [resolution, setResolution] = useState<"local" | "remote" | null>(null);

  const refresh = useCallback(() => {
    void Promise.all([import("../auth/microsoft"), import("../storage/database"), import("../sync/engine")])
      .then(async ([auth, storage, sync]) => {
        const snapshot = sync.syncSnapshot();
        setConfigured(auth.authConfigured()); setStatus(snapshot);
        if (snapshot.conflict) setConflict(await sync.getSyncConflict(snapshot.conflict.path)); else setConflict(null);
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
    void import("../sync/engine").then((sync) => { const update = () => refresh(); update(); unlisten = sync.subscribeSync(update); });
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
    if (!name) {
      const { PENDING_ONE_DRIVE_CONNECT } = await import("../sync/pendingConnect");
      await storage.setSetting(PENDING_ONE_DRIVE_CONNECT, true);
      return auth.signIn();
    }
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
    <header><button aria-label="返回设置" onClick={() => setPage(mobileSettingsParentPage(page))}><ArrowLeft size={20} /></button><h1>{page === "sync" ? "同步" : page === "conflict" ? "同步冲突" : page === "advanced" ? "高级同步" : page === "storage" ? "数据与存储" : page === "trash" ? "回收站" : page === "appearance" ? "外观" : page === "updates" ? "检查更新" : "BookReader"}</h1></header>
    {page === "sync" && <section className="mobile-settings-detail"><h2>OneDrive</h2><div className="mobile-settings-status"><span>当前状态</span><strong><SyncDot kind={state.kind} />{state.label}</strong></div>{name && <div className="mobile-settings-status"><span>账号</span><strong>{name}</strong></div>}{status.conflict && <button className="mobile-settings-conflict-link" onClick={() => setPage("conflict")}><span><b>同步需要处理</b><small>1 个冲突</small></span><ChevronRight size={17} /></button>}{name && connected && <button className="mobile-settings-row-button" disabled={busy} onClick={() => void action(async () => { const storage = await import("../storage/database"); await storage.setSetting("syncEnabled", !enabled); })}>自动同步 <span>{enabled ? "已开启" : "已关闭"}</span></button>}<div className="mobile-settings-actions">{(!name || !connected) ? <button className="mobile-settings-primary" disabled={busy || !configured} onClick={connectOrSignIn}>连接 OneDrive</button> : <><button className="mobile-settings-secondary" disabled={busy} onClick={() => void action(async () => (await import("../auth/microsoft")).reauthorizeOneDrive())}>重新连接</button><button className="mobile-settings-sync-now" disabled={busy || !online || status.phase === "syncing" || !!status.conflict} onClick={() => void action(async () => (await import("../sync/engine")).syncNow())}>{status.phase === "syncing" ? "正在同步…" : "立即同步"}</button></>}</div>{name && <button className="mobile-settings-link" onClick={() => setPage("advanced")}>高级设置 <ChevronRight size={16} /></button>}{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>}
    {page === "conflict" && <MobileSyncConflict conflict={conflict} busy={busy} resolution={resolution} onChoose={setResolution} onCancel={() => setResolution(null)} onResolve={() => { if (!conflict || !resolution) return; void action(async () => { const sync = await import("../sync/engine"); await sync.resolveSyncConflict(conflict.path, resolution); setResolution(null); setPage("sync"); }); }} message={message} />}
    {page === "advanced" && <section className="mobile-settings-detail"><h2>高级同步</h2><button className="mobile-settings-row-button" disabled={busy} onClick={() => void action(async () => (await import("../auth/microsoft")).reauthorizeOneDrive())}>重新授权 OneDrive <ChevronRight size={16} /></button>{libraryUrl.startsWith("https://") && <a className="mobile-settings-row-button" href={libraryUrl} target="_blank" rel="noreferrer">查看 OneDrive 书库 <ChevronRight size={16} /></a>}{import.meta.env.DEV && CloudSettings && <details className="mobile-settings-dev"><summary>开发诊断</summary><Suspense fallback={<p>正在载入诊断工具…</p>}><CloudSettings /></Suspense></details>}<button className="mobile-settings-danger" disabled={busy} onClick={() => void action(async () => (await import("../auth/microsoft")).signOut())}>退出账号</button>{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>}
    {page === "storage" && <section className="mobile-settings-detail"><h2>离线图书</h2><p>已下载的图书可在无网络时阅读。</p><div className="mobile-settings-storage"><strong><ShieldCheck size={18} />本地数据保护</strong><p>帮助降低系统自动清理 BookReader 数据的可能性。</p><button onClick={() => void action(async () => { const granted = await navigator.storage?.persist?.(); setMessage(granted ? "本地数据保护已开启。" : "暂时无法开启本地数据保护。"); })}>保护本地数据</button></div>{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>}
    {page === "trash" && <Suspense fallback={<p className="mobile-settings-loading">正在读取回收站…</p>}><TrashSettings /></Suspense>}
    {page === "appearance" && <section className="mobile-settings-detail"><div className="mobile-appearance-previews"><AppearancePreview appearance="light" selected={appearance === "light"} onSelect={onAppearanceChange} /><AppearancePreview appearance="dark" selected={appearance === "dark"} onSelect={onAppearanceChange} /></div><p>阅读页的明亮、纸张和夜间主题在 Aa 中单独设置。</p></section>}
    {page === "updates" && <MobileUpdatePage />}
    {page === "about" && <section className="mobile-settings-detail mobile-settings-about"><h2>BookReader</h2><p>私人 EPUB 阅读器</p></section>}
  </main>;
}

function MobileSyncConflict({ conflict, busy, resolution, onChoose, onCancel, onResolve, message }: {
  conflict: SyncConflictDetail | null; busy: boolean; resolution: "local" | "remote" | null;
  onChoose: (choice: "local" | "remote") => void; onCancel: () => void; onResolve: () => void; message: string;
}) {
  if (!conflict) return <section className="mobile-settings-detail"><p>正在读取 OneDrive 当前版本…</p>{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>;
  const annotation = conflict.kind === "annotation";
  return <section className="mobile-settings-detail mobile-sync-conflict">
    <p className="mobile-sync-conflict-book">{conflict.bookTitle}</p>
    <h2>{annotation ? "笔记存在两个版本" : "读后总结存在两个版本"}</h2>
    {annotation && <section className="mobile-sync-conflict-quote"><span>摘录</span><p>{conflict.local.deletedAt && conflict.remote.deletedAt ? "这条摘录已在两个版本中删除" : `“${conflict.local.quote || conflict.remote.quote || "摘录"}”`}</p></section>}
    <p>这条笔记在本机和 OneDrive 中都发生过修改。BookReader 不会自动覆盖任一版本。</p>
    <ConflictVersionCard title="本机版本" version={conflict.local} annotation={annotation} />
    <ConflictVersionCard title="OneDrive 版本" version={conflict.remote} annotation={annotation} />
    <div className="mobile-sync-conflict-actions"><button className="mobile-settings-primary" disabled={busy} onClick={() => onChoose("local")}>保留本机版本</button><button disabled={busy} onClick={() => onChoose("remote")}>保留 OneDrive 版本</button></div>
    {message && <p className="mobile-settings-message" role="status">{message}</p>}
    {resolution && <div className="mobile-sync-conflict-confirm-layer" role="dialog" aria-modal="true" aria-labelledby="sync-conflict-confirm-title"><button className="mobile-sync-conflict-confirm-backdrop" aria-label="取消" onClick={onCancel} /><section className="mobile-sync-conflict-confirm"><strong id="sync-conflict-confirm-title">{resolution === "local" ? "保留本机版本？" : "保留 OneDrive 版本？"}</strong><p>{resolution === "local" ? "OneDrive 中当前版本将被本机版本替换。" : "本机当前待同步修改将被 OneDrive 版本替换。"}</p><div><button disabled={busy} onClick={onCancel}>取消</button><button className={resolution === "local" ? "mobile-sync-conflict-keep-local" : "mobile-sync-conflict-keep-remote"} disabled={busy} onClick={onResolve}>{resolution === "local" ? "确认保留本机" : "确认保留 OneDrive"}</button></div></section></div>}
  </section>;
}
function ConflictVersionCard({ title, version, annotation }: { title: string; version: ConflictVersion; annotation: boolean }) {
  const deleted = !!version.deletedAt;
  return <section className="mobile-sync-conflict-version"><strong>{title}</strong>{deleted ? <p className="mobile-sync-conflict-deleted">已删除这条摘录</p> : annotation ? <><span>{version.chapterTitle}</span><p>{version.reflection || "没有感悟"}</p></> : <p>{version.summary || "还没有读后总结"}</p>}</section>;
}

function MobileUpdatePage() { const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [update, setUpdate] = useState<(() => Promise<void>) | null>(null); useEffect(() => { let unsubscribe: (() => void) | undefined; void import("../pwa-update").then((pwa) => { const refresh = () => setUpdate(pwa.getAvailablePwaUpdate()); refresh(); unsubscribe = pwa.subscribePwaUpdate(refresh); }); return () => unsubscribe?.(); }, []); const check = async () => { setBusy(true); setMessage(""); try { const { requestPwaUpdateCheck } = await import("../pwa-update"); await requestPwaUpdateCheck(); setMessage("已检查更新；如有新版本会显示更新选项。"); } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); } }; const apply = async () => { if (!update) return; setBusy(true); setMessage(""); try { await update(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); setBusy(false); } }; return <section className="mobile-settings-detail"><p>{update ? "发现新版本，更新会重新加载应用，本机书库与待同步数据会保留。" : "前台联网时会检查应用更新。"}</p><button className="mobile-settings-primary" disabled={busy} onClick={() => void (update ? apply() : check())}>{busy ? "正在处理…" : update ? "更新" : "检查更新"}</button>{message && <p className="mobile-settings-message" role="status">{message}</p>}</section>; }
function AppearancePreview({ appearance, selected, onSelect }: { appearance: Appearance; selected: boolean; onSelect: (value: Appearance) => void }) { return <button type="button" className={`mobile-appearance-preview ${appearance} ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => onSelect(appearance)}><span className="mobile-appearance-preview-page"><i /><b /><b /><b /><em /></span><strong>{appearance === "light" ? "浅色" : "深色"}</strong>{selected && <span className="mobile-appearance-selected" aria-hidden="true">●</span>}</button>; }
function MobileSettingsGroup({ title, children }: { title: string; children: ReactNode }) { return <section className="mobile-settings-group"><h2>{title}</h2><div>{children}</div></section>; }
function SettingsRow({ icon, title, detail, trailing, onClick }: { icon: ReactNode; title: string; detail?: ReactNode; trailing?: string; onClick: () => void }) { return <button className="mobile-settings-row" onClick={onClick}><span className="mobile-settings-row-icon">{icon}</span><span className="mobile-settings-row-copy"><strong>{title}</strong>{detail && <small>{detail}</small>}</span>{trailing && <small className="mobile-settings-row-trailing">{trailing}</small>}<ChevronRight size={17} /></button>; }
function SyncDot({ kind }: { kind: MobileSyncState["kind"] }) { return <i className={`mobile-sync-dot ${kind}`} aria-hidden="true" />; }
