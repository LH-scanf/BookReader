import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Library,
  ImageIcon,
  Highlighter,
  Moon,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  Trash2,
  RotateCcw,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chooseAndImportEpubs, chooseCustomCover, chooseLibraryDirectory, deleteBook, isDesktopApp, subscribeLibraryChanges, loadAnnotations, loadBookNote, loadLibrary, persistBookNote, removeAnnotation, renameBook, restoreBookCover, saveAnnotation, setBookFinished } from "./library-api";
import { DesktopAppShell } from "./desktop/DesktopAppShell";
import { MobileAppShell } from "./mobile/MobileAppShell";
import type { AnnotationRecord, BookNote, BookRecord, LibraryFilter, LibraryState, View } from "./types";
import { getCurrentUiMode, useUiMode } from "./ui/ui-mode";

const CloudSettings = lazy(() => import("./CloudSettings"));
const TrashSettings = lazy(() => import("./TrashSettings"));
const PwaUpdateSettings = __WEB_BUILD__ ? lazy(() => import("./PwaUpdateSettings")) : null;
const EpubReader = lazy(() => import("./EpubReader"));
type Appearance = "light" | "dark";

function App() {
  const [appearance, setAppearance] = useState<Appearance>(() => document.documentElement.dataset.appearance === "dark" ? "dark" : "light");
  const [view, setView] = useState<View>("library");
  const [sidebarOpen, setSidebarOpen] = useState(() => getCurrentUiMode() === "desktop" && localStorage.getItem("sidebar-open") !== "false");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const [activeBook, setActiveBook] = useState<BookRecord | null>(null);
  const [readerTargetCfi, setReaderTargetCfi] = useState<string | null>(null);
  const [notesBookId, setNotesBookId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryState>({ libraryDir: null, books: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const uiMode = useUiMode();

  useEffect(() => { if (view === "reader" && !activeBook) setView("library"); }, [view, activeBook]);

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.style.colorScheme = appearance;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", appearance === "dark" ? "#1f2022" : "#f6f6f3");
    localStorage.setItem("app-appearance", appearance);
  }, [appearance]);

  useEffect(() => {
    localStorage.setItem("sidebar-open", String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    void loadLibrary()
      .then(setLibrary)
      .catch((reason) => setMessage(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let unlisten: (() => void) | undefined;
    void subscribeLibraryChanges(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void loadLibrary().then((next) => {
          if (disposed) return;
          setLibrary(next);
          setActiveBook((current) => {
            if (!current) return null;
            return next.books.find((book) => book.id === current.id) ?? null;
          });
        }).catch((reason) => {
          if (!disposed) setMessage(reason instanceof Error ? reason.message : String(reason));
        });
      }, 350);
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch((reason) => { if (!disposed) setMessage(String(reason)); });
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  const selectLibrary = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await chooseLibraryDirectory();
      if (next) setLibrary(next);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const importBooks = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const imported = await chooseAndImportEpubs();
      if (imported.length) {
        setLibrary(await loadLibrary());
        setMessage(`已导入 ${imported.length} 本图书`);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const updateProgress = (bookId: string, percentage: number, cfi: string | null, chapterHref: string | null) => {
    setLibrary((current) => ({
      ...current,
      books: current.books.map((book) => book.id === bookId
        ? { ...book, progress: percentage, finished: percentage >= 0.995, cfi, chapterHref }
        : book),
    }));
  };

  const changeBookStatus = async (book: BookRecord) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await setBookFinished(book.id, !book.finished);
      setLibrary((current) => ({ ...current, books: current.books.map((item) => item.id === updated.id ? updated : item) }));
      setMessage(updated.finished ? `《${updated.title}》已标记为已读` : `《${updated.title}》已重置为未读`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const removeBook = async (book: BookRecord) => {
    if (!window.confirm(`确定从书库删除《${book.title}》吗？\n\n图书将移入回收站，EPUB、封面、进度和笔记保留，可在设置中恢复。同步启用后会影响其他设备。`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteBook(book.id);
      setLibrary((current) => ({ ...current, books: current.books.filter((item) => item.id !== book.id) }));
      setMessage(`已将《${book.title}》移入回收站`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const renameBookTitle = async (book: BookRecord, title: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await renameBook(book.id, title);
      setLibrary((current) => ({ ...current, books: current.books.map((item) => item.id === updated.id ? updated : item) }));
      setActiveBook((current) => current?.id === updated.id ? updated : current);
      setMessage(`已将图书重命名为《${updated.title}》`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const changeBookCover = async (book: BookRecord) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await chooseCustomCover(book.id);
      if (updated) {
        setLibrary((current) => ({ ...current, books: current.books.map((item) => item.id === updated.id ? updated : item) }));
        setActiveBook((current) => current?.id === updated.id ? updated : current);
        setMessage(`已更换《${updated.title}》的封面`);
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const resetBookCover = async (book: BookRecord) => {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await restoreBookCover(book.id);
      setLibrary((current) => ({ ...current, books: current.books.map((item) => item.id === updated.id ? updated : item) }));
      setMessage(`已恢复《${updated.title}》的自动封面`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  if (view === "reader" && activeBook) {
    return <div className={`bookreader-${uiMode}`} data-ui-mode={uiMode}><Suspense fallback={<div className="page-loading"><span className="loading-spinner" />正在启动阅读器…</div>}><EpubReader book={activeBook} deviceId={library.deviceId ?? null} initialPreviewCfi={readerTargetCfi} onBack={() => { setReaderTargetCfi(null); setView("library"); }} onOpenNotes={() => { setReaderTargetCfi(null); setNotesBookId(activeBook.id); setView("notes"); }} onProgress={updateProgress} /></Suspense></div>;
  }

  const closeSidebarForMobile = () => { if (uiMode === "mobile") setSidebarOpen(false); };
  const navigationItems = [
    { label: "我的书库", icon: <Library size={18} />, active: view === "library" && filter === "all", onSelect: () => { setView("library"); setFilter("all"); closeSidebarForMobile(); } },
    { label: "已读", icon: <CheckCircle2 size={18} />, active: view === "library" && filter === "finished", onSelect: () => { setView("library"); setFilter("finished"); closeSidebarForMobile(); } },
    { label: "整书笔记", icon: <NotebookPen size={18} />, active: view === "notes", onSelect: () => { setView("notes"); closeSidebarForMobile(); } },
  ];
  const footerItem = { label: "设置", icon: <Settings size={18} />, active: view === "settings", onSelect: () => { setView("settings"); closeSidebarForMobile(); } };
  const sidebarStatus = sidebarOpen && library.libraryDir && <div className="sidebar-sync"><span className="sync-dot" />{isDesktopApp() ? "书库目录已连接" : "本机离线书库"}</div>;
  const shellMessage = message && <div className="app-message" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage(null)}><X size={15} /></button></div>;
  const AppShell = uiMode === "mobile" ? MobileAppShell : DesktopAppShell;

  return (
    <AppShell sidebarOpen={sidebarOpen} onCloseSidebar={() => setSidebarOpen(false)} onOpenSidebar={() => setSidebarOpen(true)} navigationItems={navigationItems} footerItem={footerItem} sidebarStatus={sidebarStatus} message={shellMessage}>
      {view === "settings" ? (
          <SettingsView libraryDir={library.libraryDir} busy={busy} onSelectLibrary={selectLibrary} appearance={appearance} onAppearanceChange={setAppearance} />
        ) : loading ? (
          <div className="page-loading"><span className="loading-spinner" />正在读取书库…</div>
        ) : !library.libraryDir ? (
          <LibrarySetup busy={busy} onSelect={selectLibrary} />
        ) : view === "notes" ? (
          <NotesWorkspace books={library.books} selectedBookId={notesBookId} onSelectBook={setNotesBookId} onMessage={setMessage} onOpenQuote={(book, cfi) => { setActiveBook(book); setReaderTargetCfi(cfi); setNotesBookId(book.id); setView("reader"); }} />
        ) : (
          <LibraryView filter={filter} search={search} books={library.books} busy={busy} onSearch={setSearch} onImport={importBooks} onRename={(book, title) => void renameBookTitle(book, title)} onChangeCover={(book) => void changeBookCover(book)} onRestoreCover={(book) => void resetBookCover(book)} onSetFinished={(book) => void changeBookStatus(book)} onDelete={(book) => void removeBook(book)} onOpenBook={(book) => { setActiveBook(book); setReaderTargetCfi(null); setNotesBookId(book.id); setView("reader"); }} />
        )}
    </AppShell>
  );
}

function LibrarySetup({ busy, onSelect }: { busy: boolean; onSelect: () => void }) {
  return (
    <section className="library-setup">
      <div className="setup-icon"><BookOpen size={30} /></div>
      <p className="eyebrow">欢迎使用 BookReader</p>
      <h1>先选择一个书库目录</h1>
      <p>图书和阅读进度会保存在这里。可以选择普通文件夹，也可以选择 OneDrive 中的文件夹。</p>
      <button className="primary-button" disabled={busy} onClick={onSelect}>{busy ? "正在打开…" : "选择书库目录"}</button>
      <small>以后可以在“设置”中切换或迁移书库。</small>
    </section>
  );
}

type SortMode = "recent" | "title-asc" | "title-desc";

function LibraryView({ filter, search, books, busy, onSearch, onImport, onOpenBook, onRename, onChangeCover, onRestoreCover, onSetFinished, onDelete }: {
  filter: LibraryFilter;
  search: string;
  books: BookRecord[];
  busy: boolean;
  onSearch: (value: string) => void;
  onImport: () => void;
  onOpenBook: (book: BookRecord) => void;
  onRename: (book: BookRecord, title: string) => void;
  onChangeCover: (book: BookRecord) => void;
  onRestoreCover: (book: BookRecord) => void;
  onSetFinished: (book: BookRecord) => void;
  onDelete: (book: BookRecord) => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const stored = localStorage.getItem("library-sort");
    return stored === "title-asc" || stored === "title-desc" ? stored : "recent";
  });
  const [sortOpen, setSortOpen] = useState(false);
  const [menuBookId, setMenuBookId] = useState<string | null>(null);
  const [renamingBook, setRenamingBook] = useState<BookRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => localStorage.setItem("library-sort", sortMode), [sortMode]);
  useEffect(() => {
    if (!sortOpen && !menuBookId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSortOpen(false);
        setMenuBookId(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuBookId, sortOpen]);

  const visibleBooks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = books.filter((book) => {
      const matchesFilter = filter === "all" || book.finished;
      const matchesSearch = !query || book.title.toLocaleLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
    return filtered.sort((left, right) => {
      if (sortMode === "recent") return right.importedAt.localeCompare(left.importedAt);
      const comparison = left.title.localeCompare(right.title, "zh-CN", { numeric: true, sensitivity: "base" });
      return sortMode === "title-asc" ? comparison : -comparison;
    });
  }, [books, filter, search, sortMode]);

  const continueBook = books.filter((book) => book.progress > 0 && !book.finished).sort((left, right) => right.progress - left.progress)[0];
  const sortLabel = sortMode === "recent" ? "最近导入" : sortMode === "title-asc" ? "书名 A–Z" : "书名 Z–A";
  const closeMenus = () => { setSortOpen(false); setMenuBookId(null); };
  const beginRename = (book: BookRecord) => {
    closeMenus();
    setRenamingBook(book);
    setRenameValue(book.title);
  };

  return (
    <div className="library-page">
      <header className="library-header">
        <div><p className="eyebrow">个人阅读空间</p><h1>{filter === "finished" ? "已读" : "我的书库"}</h1></div>
        <div className="library-actions">
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索书名" aria-label="搜索书名" />{search && <button aria-label="清除搜索" onClick={() => onSearch("")}><X size={15} /></button>}</label>
          {filter === "all" && <button className="primary-button compact-import-button" disabled={busy} onClick={onImport}><Plus size={16} />{busy ? "导入中…" : "导入图书"}</button>}
        </div>
      </header>

      {filter === "all" && !search && continueBook && (
        <section className="continue-reading" aria-label="继续阅读">
          <Cover book={continueBook} mini />
          <div className="continue-copy"><span className="section-kicker">继续阅读</span><h2>{continueBook.title}</h2><p>{continueBook.author}</p><div className="wide-progress"><span style={{ width: `${continueBook.progress * 100}%` }} /></div></div>
          <span className="continue-percent">{Math.round(continueBook.progress * 100)}%</span>
          <button className="secondary-button" onClick={() => onOpenBook(continueBook)}>继续阅读<ChevronRight size={17} /></button>
        </section>
      )}

      <section className="book-section">
        <div className="section-heading"><h2>{search ? `“${search}”的搜索结果` : filter === "finished" ? "读完的书" : "全部图书"}</h2><div className="sort-control"><button className={`quiet-button ${sortOpen ? "active" : ""}`} aria-haspopup="menu" aria-expanded={sortOpen} onClick={() => { setSortOpen((value) => !value); setMenuBookId(null); }}><SlidersHorizontal size={16} />{sortLabel}</button>{sortOpen && <div className="context-menu sort-menu" role="menu"><button className={sortMode === "recent" ? "selected" : ""} onClick={() => { setSortMode("recent"); closeMenus(); }}>最近导入</button><button className={sortMode === "title-asc" ? "selected" : ""} onClick={() => { setSortMode("title-asc"); closeMenus(); }}>书名 A–Z</button><button className={sortMode === "title-desc" ? "selected" : ""} onClick={() => { setSortMode("title-desc"); closeMenus(); }}>书名 Z–A</button></div>}</div></div>
        {visibleBooks.length ? (
          <div className="book-grid">{visibleBooks.map((book) => <BookCard key={book.id} book={book} menuOpen={menuBookId === book.id} onToggleMenu={() => { setMenuBookId((current) => current === book.id ? null : book.id); setSortOpen(false); }} onOpen={() => { closeMenus(); onOpenBook(book); }} onRename={() => beginRename(book)} onChangeCover={() => { closeMenus(); onChangeCover(book); }} onRestoreCover={() => { closeMenus(); onRestoreCover(book); }} onSetFinished={() => { closeMenus(); onSetFinished(book); }} onDelete={() => { closeMenus(); onDelete(book); }} />)}</div>
        ) : (
          <div className="empty-state"><BookMarked size={28} /><h3>{search ? "没有找到图书" : filter === "finished" ? "还没有已读图书" : "书库还是空的"}</h3><p>{search ? "尝试更换搜索词。" : filter === "finished" ? "读完一本书后，它会显示在这里。" : "点击右上角的“导入图书”，选择一个或多个 EPUB 文件。"}</p>{!books.length && filter === "all" && !search && <button className="secondary-button" onClick={onImport}>导入第一本书</button>}</div>
        )}
      </section>
      {(sortOpen || menuBookId) && <button className="menu-backdrop" aria-label="关闭菜单" onClick={closeMenus} />}
      {renamingBook && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRenamingBook(null); }}>
          <form className="rename-dialog" onSubmit={(event) => { event.preventDefault(); const title = renameValue.trim(); if (!title || busy) return; onRename(renamingBook, title); setRenamingBook(null); }}>
            <div><span className="dialog-kicker">编辑图书信息</span><h2>重命名图书</h2><p>只修改书库中显示的名称，不会改动 EPUB 原文件。</p></div>
            <label>书名<input autoFocus maxLength={300} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /></label>
            <div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setRenamingBook(null)}>取消</button><button type="submit" className="primary-button" disabled={busy || !renameValue.trim()}>保存</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function Cover({ book, mini = false }: { book: BookRecord; mini?: boolean }) {
  if (book.coverDataUrl) return <div className={mini ? "mini-cover cover-image-shell" : "book-cover cover-image-shell"}><img src={book.coverDataUrl} alt={`${book.title}封面`} /></div>;
  const variants = ["cover-forest", "cover-violet", "cover-clay", "cover-blue", "cover-sand"];
  const variant = variants[book.id.charCodeAt(0) % variants.length];
  if (mini) return <div className={`mini-cover ${variant}`}>{book.title.slice(0, 6)}</div>;
  return <div className={`book-cover ${variant}`}><span className="cover-title">{book.title}</span><span className="cover-subtitle">BookReader 文字封面</span><span className="cover-author">{book.author}</span></div>;
}

function BookCard({ book, menuOpen, onToggleMenu, onOpen, onRename, onChangeCover, onRestoreCover, onSetFinished, onDelete }: { book: BookRecord; menuOpen: boolean; onToggleMenu: () => void; onOpen: () => void; onRename: () => void; onChangeCover: () => void; onRestoreCover: () => void; onSetFinished: () => void; onDelete: () => void }) {
  const percent = Math.round(book.progress * 100);
  return (
    <article className="book-card" onClick={onOpen} tabIndex={0} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) onOpen(); }}>
      <div className="cover-with-menu"><Cover book={book} /><button className="book-menu" aria-label={`${book.title}的更多操作`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); onToggleMenu(); }}><MoreHorizontal size={18} /></button>{menuOpen && <div className="context-menu book-action-menu" role="menu" onClick={(event) => event.stopPropagation()}><button onClick={onOpen}><BookOpen size={16} />打开图书</button>{isDesktopApp() && <><button onClick={onRename}><Pencil size={16} />重命名</button><button onClick={onChangeCover}><ImageIcon size={16} />更换封面</button><button onClick={onRestoreCover}><RotateCcw size={16} />恢复自动封面</button></>}<button onClick={onSetFinished}><CheckCircle2 size={16} />{book.finished ? "标记为未读" : "标记为已读"}</button>{!isDesktopApp() && book.cached && <button onClick={() => { void import("./sync/engine").then(({ evictBook }) => evictBook(book.id)).catch((error) => window.alert(String(error))); }}>移除本机下载</button>}<div className="menu-separator" /><button className="destructive" onClick={onDelete}><Trash2 size={16} />从书库删除</button></div>}</div>
      <div className="book-meta"><h3>{book.title}</h3><p>{book.author}</p></div>
      <div className="card-progress"><span style={{ width: `${percent}%` }} /></div>
      <div className="progress-label">{!isDesktopApp() && <span>{book.cached ? "已下载 · " : "云端 · "}</span>}<span>{book.finished ? "已读" : percent ? `已阅读 ${percent}%` : "未读"}</span></div>
    </article>
  );
}

function formatNoteDate(value: string, compact = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  if (compact) {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  }
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function compactCfi(value: string) {
  if (value.length <= 58) return value;
  return `${value.slice(0, 28)}…${value.slice(-24)}`;
}

function NotesWorkspace({ books, selectedBookId, onSelectBook, onMessage, onOpenQuote }: {
  books: BookRecord[];
  selectedBookId: string | null;
  onSelectBook: (bookId: string | null) => void;
  onMessage: (message: string | null) => void;
  onOpenQuote: (book: BookRecord, cfi: string | null) => void;
}) {
  const selectedId = selectedBookId && books.some((book) => book.id === selectedBookId)
    ? selectedBookId
    : books[0]?.id ?? null;
  const [note, setNote] = useState<BookNote | null>(null);
  const [summary, setSummary] = useState("");
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [reflectionDrafts, setReflectionDrafts] = useState<Record<string, string>>({});
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [bookPickerOpen, setBookPickerOpen] = useState(false);
  const refreshRequestRef = useRef(0);
  const selectionVersionRef = useRef(0);
  const summaryDirtyRef = useRef(false);
  const reflectionDirtyRef = useRef(new Set<string>());
  const selectedBook = books.find((book) => book.id === selectedId) ?? null;
  const displayedAnnotations = note?.bookId === selectedId ? annotations : [];
  const sortedAnnotations = useMemo(() => [...displayedAnnotations].sort((left, right) => {
    const comparison = right.createdAt.localeCompare(left.createdAt);
    return sortNewestFirst ? comparison : -comparison;
  }), [displayedAnnotations, sortNewestFirst]);
  const selectedAnnotation = displayedAnnotations.find((record) => record.id === selectedAnnotationId) ?? null;

  useEffect(() => {
    if (selectedId !== selectedBookId) onSelectBook(selectedId);
  }, [onSelectBook, selectedBookId, selectedId]);

  useEffect(() => {
    refreshRequestRef.current += 1;
    selectionVersionRef.current += 1;
    summaryDirtyRef.current = false;
    reflectionDirtyRef.current.clear();
    setSavingId(null);
    setNote(null);
    setSummary("");
    setAnnotations([]);
    setReflectionDrafts({});
    setSelectedAnnotationId(null);
    setShowSummary(false);
    setBookPickerOpen(false);
    return () => { refreshRequestRef.current += 1; selectionVersionRef.current += 1; };
  }, [selectedId]);

  const refresh = useCallback(async (background = false) => {
    const requestId = ++refreshRequestRef.current;
    if (!selectedId) { setNote(null); setSummary(""); setAnnotations([]); return; }
    if (!background) setLoadingNotes(true);
    try {
      const [nextAnnotations, nextNote] = await Promise.all([loadAnnotations(selectedId), loadBookNote(selectedId)]);
      if (requestId !== refreshRequestRef.current) return;
      setAnnotations(nextAnnotations);
      setNote(nextNote);
      setSummary((current) => summaryDirtyRef.current ? current : nextNote.summary);
      setReflectionDrafts((current) => Object.fromEntries(nextAnnotations.map((record) => [record.id,
        reflectionDirtyRef.current.has(record.id) ? current[record.id] ?? record.reflection : record.reflection,
      ])));
      setSelectedAnnotationId((current) => {
        if (current && nextAnnotations.some((record) => record.id === current)) return current;
        return [...nextAnnotations].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.id ?? null;
      });
      if (!nextAnnotations.length) setShowSummary(true);
    } catch (reason) {
      if (requestId !== refreshRequestRef.current) return;
      onMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (requestId === refreshRequestRef.current) setLoadingNotes(false);
    }
  }, [onMessage, selectedId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let unlisten: (() => void) | undefined;
    void subscribeLibraryChanges(() => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(true), 450);
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; });
    return () => { disposed = true; if (timer) clearTimeout(timer); unlisten?.(); };
  }, [refresh]);

  const saveSummary = async () => {
    if (!selectedId) return;
    const selectionVersion = selectionVersionRef.current;
    setSavingId("summary");
    try {
      const saved = await persistBookNote(selectedId, summary);
      if (selectionVersion !== selectionVersionRef.current) return;
      refreshRequestRef.current += 1;
      setNote(saved);
      setSummary(saved.summary);
      summaryDirtyRef.current = false;
      onMessage("整书总结已保存");
    } catch (reason) { if (selectionVersion === selectionVersionRef.current) onMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (selectionVersion === selectionVersionRef.current) { setSavingId(null); setLoadingNotes(false); } }
  };

  const saveReflection = async (record: AnnotationRecord) => {
    const selectionVersion = selectionVersionRef.current;
    setSavingId(record.id);
    try {
      const saved = await saveAnnotation({
        id: record.id,
        bookId: record.bookId,
        quote: record.quote,
        reflection: reflectionDrafts[record.id] ?? "",
        chapterTitle: record.chapterTitle,
        chapterHref: record.chapterHref,
        cfiRange: record.cfiRange,
      });
      if (selectionVersion !== selectionVersionRef.current) return;
      refreshRequestRef.current += 1;
      setAnnotations((current) => current.map((item) => item.id === saved.id ? saved : item));
      setReflectionDrafts((current) => ({ ...current, [saved.id]: saved.reflection }));
      reflectionDirtyRef.current.delete(saved.id);
      onMessage("感悟已保存");
    } catch (reason) { if (selectionVersion === selectionVersionRef.current) onMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (selectionVersion === selectionVersionRef.current) { setSavingId(null); setLoadingNotes(false); } }
  };

  const deleteRecord = async (record: AnnotationRecord) => {
    if (!window.confirm("确定删除这条高亮和感悟吗？")) return;
    setSavingId(record.id);
    const selectionVersion = selectionVersionRef.current;
    try {
      await removeAnnotation(record.bookId, record.id);
      if (selectionVersion !== selectionVersionRef.current) return;
      refreshRequestRef.current += 1;
      setAnnotations((current) => current.filter((item) => item.id !== record.id));
      reflectionDirtyRef.current.delete(record.id);
      const remaining = sortedAnnotations.filter((item) => item.id !== record.id);
      setSelectedAnnotationId(remaining[0]?.id ?? null);
      if (!remaining.length) setShowSummary(true);
      onMessage("高亮和感悟已删除");
    } catch (reason) { if (selectionVersion === selectionVersionRef.current) onMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (selectionVersion === selectionVersionRef.current) { setSavingId(null); setLoadingNotes(false); } }
  };

  const selectBook = (bookId: string) => {
    if (bookId === selectedId) return;
    if ((summaryDirtyRef.current || reflectionDirtyRef.current.size > 0)
      && !window.confirm("当前笔记有未保存的修改。放弃修改并切换图书吗？")) return;
    refreshRequestRef.current += 1;
    selectionVersionRef.current += 1;
    onSelectBook(bookId);
  };

  const discardDrafts = () => {
    summaryDirtyRef.current = false;
    reflectionDirtyRef.current.clear();
    setSummary(note?.summary ?? "");
    setReflectionDrafts(Object.fromEntries(annotations.map((record) => [record.id, record.reflection])));
  };

  const selectDetail = (target: "summary" | AnnotationRecord) => {
    const nextIsSummary = target === "summary";
    const nextId = nextIsSummary ? null : target.id;
    if (showSummary === nextIsSummary && selectedAnnotationId === nextId) return;
    if ((summaryDirtyRef.current || reflectionDirtyRef.current.size > 0)
      && !window.confirm("当前内容有未保存的修改。放弃修改并继续吗？")) return;
    discardDrafts();
    setShowSummary(nextIsSummary);
    setSelectedAnnotationId(nextId);
  };

  return (
    <div className="notes-workspace-page">
      <header className="notes-workspace-header">
        <div className="notes-page-heading"><p className="eyebrow">阅读与思考</p><h1>整书笔记</h1></div>
        {selectedBook && <div className="notes-book-toolbar">
          <div className="notes-book-picker">
            <button className="notes-current-book" aria-haspopup="listbox" aria-expanded={bookPickerOpen} onClick={() => setBookPickerOpen((value) => !value)}>
              <Cover book={selectedBook} mini />
              <span><strong>{selectedBook.title}</strong><small>{selectedBook.author}</small></span>
              <ChevronDown size={17} />
            </button>
            {bookPickerOpen && <div className="notes-book-menu" role="listbox" aria-label="切换图书">
              {books.map((book) => <button key={book.id} role="option" aria-selected={book.id === selectedId} onClick={() => { selectBook(book.id); setBookPickerOpen(false); }}><Cover book={book} mini /><span><strong>{book.title}</strong><small>{book.author}</small></span></button>)}
            </div>}
          </div>
          <span className="notes-count"><strong>{displayedAnnotations.length}</strong> 条摘录</span>
          <button className={`secondary-button notes-summary-entry ${showSummary ? "active" : ""}`} onClick={() => selectDetail("summary")}><NotebookPen size={16} />整书总结</button>
          <button className="secondary-button" onClick={() => onOpenQuote(selectedBook, null)}><BookOpen size={16} />打开图书</button>
        </div>}
      </header>

      {!books.length ? <div className="empty-state"><NotebookPen size={28} /><h3>还没有可记录的图书</h3><p>导入一本 EPUB 并开始阅读后，就可以建立整书笔记。</p></div> : (
        <div className="notes-master-detail">
          <aside className="notes-list-pane" aria-label="当前图书笔记列表">
            <div className="notes-list-heading"><h2>全部笔记 <span>{displayedAnnotations.length}</span></h2><button onClick={() => setSortNewestFirst((value) => !value)}>{sortNewestFirst ? "最新" : "最早"}<ChevronDown size={14} /></button></div>
            <div className="notes-list-scroll">
              {loadingNotes && !note ? <div className="notes-loading compact"><span className="loading-spinner" />正在读取笔记…</div> : sortedAnnotations.length ? sortedAnnotations.map((record) => (
                <button key={record.id} className={`note-list-item ${!showSummary && selectedAnnotationId === record.id ? "active" : ""}`} onClick={() => selectDetail(record)}>
                  <span className="note-list-quote">❝</span>
                  <p>{record.quote}</p>
                  {record.reflection && <span className="note-list-reflection">有感悟</span>}
                  <footer><span>{record.chapterTitle || record.chapterHref || "正文"}</span><time dateTime={record.createdAt}>{formatNoteDate(record.createdAt, true)}</time></footer>
                </button>
              )) : <div className="notes-empty-list"><Highlighter size={22} /><p>还没有摘录</p><span>阅读时选中原文即可添加。</span></div>}
            </div>
          </aside>

          <section className="notes-detail-pane">
            <fieldset className="notes-detail-body" disabled={savingId !== null}>
              {loadingNotes && !note ? <div className="notes-loading"><span className="loading-spinner" />正在读取笔记…</div> : !selectedBook || !note || note.bookId !== selectedId ? <div className="notes-loading">请选择一本图书</div> : showSummary ? (
                <article className="summary-detail">
                  <header><div><span>当前图书</span><h2>整书总结</h2><p>{selectedBook.title}</p></div>{!isDesktopApp() && <span className="read-only-badge">移动端只读</span>}</header>
                  <label><span>我的整书总结</span><textarea readOnly={!isDesktopApp()} value={summary} onChange={(event) => { summaryDirtyRef.current = true; setSummary(event.target.value); }} placeholder={isDesktopApp() ? "记录你对整本书的理解、问题和收获……" : "尚未在桌面端记录整书总结"} /></label>
                  <footer><span>最后更新：{note.updatedAt ? formatNoteDate(note.updatedAt) : "尚未保存"}</span>{isDesktopApp() && <button className="primary-button" disabled={savingId === "summary" || summary === note.summary} onClick={() => void saveSummary()}><Save size={15} />{savingId === "summary" ? "保存中…" : "保存总结"}</button>}</footer>
                </article>
              ) : selectedAnnotation ? (
                <article className="note-detail">
                  <header className="note-detail-header"><span>所属章节</span><h2>{selectedAnnotation.chapterTitle || selectedAnnotation.chapterHref || "正文"}</h2></header>
                  <blockquote className="note-detail-quote"><span aria-hidden="true">❝</span><p>{selectedAnnotation.quote}</p><footer>—— {selectedBook.author || "佚名"}《{selectedBook.title}》</footer></blockquote>
                  <label className="note-reflection-editor"><span>我的感悟</span><textarea value={reflectionDrafts[selectedAnnotation.id] ?? ""} onChange={(event) => { reflectionDirtyRef.current.add(selectedAnnotation.id); setReflectionDrafts((current) => ({ ...current, [selectedAnnotation.id]: event.target.value })); }} placeholder="写下你对这段摘录的理解、联想或批注……" /><button className="primary-button" disabled={savingId === selectedAnnotation.id || (reflectionDrafts[selectedAnnotation.id] ?? "") === selectedAnnotation.reflection} onClick={() => void saveReflection(selectedAnnotation)}><Save size={15} />{savingId === selectedAnnotation.id ? "保存中…" : "保存感悟"}</button></label>
                  <dl className="note-metadata">
                    <div><dt>摘录时间</dt><dd>{formatNoteDate(selectedAnnotation.createdAt)}</dd></div>
                    <div><dt>所属章节</dt><dd>{selectedAnnotation.chapterTitle || selectedAnnotation.chapterHref || "正文"}</dd></div>
                    <div><dt>原文位置</dt><dd title={selectedAnnotation.cfiRange}>{compactCfi(selectedAnnotation.cfiRange)}</dd></div>
                    <div><dt>更新时间</dt><dd>{formatNoteDate(selectedAnnotation.updatedAt)}</dd></div>
                  </dl>
                  <footer className="note-detail-actions"><button className="secondary-button" onClick={() => onOpenQuote(selectedBook, selectedAnnotation.cfiRange)}><BookOpen size={15} />回到原文</button><button className="quiet-button destructive-text" disabled={savingId === selectedAnnotation.id} onClick={() => void deleteRecord(selectedAnnotation)}><Trash2 size={15} />删除笔记</button></footer>
                </article>
              ) : <div className="notes-empty-large"><Highlighter size={24} /><p>选择左侧的一条摘录，或打开整书总结。</p></div>}
            </fieldset>
          </section>
        </div>
      )}
    </div>
  );
}

function SettingsView({ libraryDir, busy, onSelectLibrary, appearance, onAppearanceChange }: { libraryDir: string | null; busy: boolean; onSelectLibrary: () => void; appearance: Appearance; onAppearanceChange: (appearance: Appearance) => void }) {
  return (
    <div className="settings-page">
      <p className="eyebrow">BookReader</p><h1>设置</h1>
      {isDesktopApp() ? <section className="settings-card">
        <div><h2>书库与同步</h2><p>书籍、进度和未来的批注会保存在这个普通文件夹中。</p></div>
        <div className="directory-row"><div><span>当前书库目录</span><code>{libraryDir ?? "尚未选择"}</code></div><button className="secondary-button" disabled={busy} onClick={onSelectLibrary}>{libraryDir ? "切换目录" : "选择目录"}</button></div>
        <div className="status-row">{libraryDir ? <><span className="sync-dot" />目录可用；可交由 OneDrive 等工具同步</> : "选择目录后才能导入图书"}</div>
      </section> : <Suspense fallback={<p>正在加载同步设置…</p>}><CloudSettings /></Suspense>}
      {PwaUpdateSettings && !isDesktopApp() && <Suspense fallback={null}><PwaUpdateSettings /></Suspense>}
      <Suspense fallback={null}><TrashSettings /></Suspense>
      <section className="settings-card appearance-card"><div><h2>外观</h2><p>应用于书库、整书笔记和设置，自动记住选择。阅读页的明亮、纸张和夜间主题独立设置。</p></div><div className="appearance-options" role="group" aria-label="应用外观"><button aria-pressed={appearance === "light"} onClick={() => onAppearanceChange("light")}><Sun size={18} />浅色</button><button aria-pressed={appearance === "dark"} onClick={() => onAppearanceChange("dark")}><Moon size={18} />深色</button></div></section>
    </div>
  );
}

export default App;
