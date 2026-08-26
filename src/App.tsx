import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Library,
  ImageIcon,
  Highlighter,
  Menu,
  Moon,
  MoreHorizontal,
  NotebookPen,
  PanelLeftClose,
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
import { listen } from "@tauri-apps/api/event";
import { chooseAndImportEpubs, chooseCustomCover, chooseLibraryDirectory, deleteBook, isDesktopApp, loadAnnotations, loadBookNote, loadLibrary, persistBookNote, removeAnnotation, renameBook, restoreBookCover, saveAnnotation, setBookFinished } from "./library-api";
import type { AnnotationRecord, BookNote, BookRecord, LibraryFilter, LibraryState, View } from "./types";

const EpubReader = lazy(() => import("./EpubReader"));
type Appearance = "light" | "dark";

function App() {
  const [appearance, setAppearance] = useState<Appearance>(() => document.documentElement.dataset.appearance === "dark" ? "dark" : "light");
  const [view, setView] = useState<View>("library");
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("sidebar-open") !== "false");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [search, setSearch] = useState("");
  const [activeBook, setActiveBook] = useState<BookRecord | null>(null);
  const [readerTargetCfi, setReaderTargetCfi] = useState<string | null>(null);
  const [notesBookId, setNotesBookId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryState>({ libraryDir: null, books: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
    if (!isDesktopApp()) return;
    let disposed = false;
    let timer: number | null = null;
    let unlisten: (() => void) | undefined;
    void listen("library-changed", () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void loadLibrary().then((next) => {
          if (disposed) return;
          setLibrary(next);
          setActiveBook((current) => {
            if (!current) return null;
            return next.books.find((book) => book.id === current.id) ?? current;
          });
        }).catch((reason) => {
          if (!disposed) setMessage(reason instanceof Error ? reason.message : String(reason));
        });
      }, 350);
    }).then((cleanup) => { unlisten = cleanup; });
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
        setLibrary((current) => ({ ...current, books: [...imported.reverse(), ...current.books] }));
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
    if (!window.confirm(`确定从书库删除《${book.title}》吗？\n\n这会删除书库中的 EPUB、封面和阅读进度。`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await deleteBook(book.id);
      setLibrary((current) => ({ ...current, books: current.books.filter((item) => item.id !== book.id) }));
      setMessage(`已从书库删除《${book.title}》`);
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
    return <Suspense fallback={<div className="page-loading"><span className="loading-spinner" />正在启动阅读器…</div>}><EpubReader book={activeBook} deviceId={library.deviceId ?? null} initialPreviewCfi={readerTargetCfi} onBack={() => { setReaderTargetCfi(null); setView("library"); }} onOpenNotes={() => { setReaderTargetCfi(null); setNotesBookId(activeBook.id); setView("notes"); }} onProgress={updateProgress} /></Suspense>;
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-is-open" : "sidebar-is-closed"}`}>
      <aside className="library-sidebar">
        <div className="sidebar-heading">
          <BookOpen size={20} />
          {sidebarOpen && <span>BookReader</span>}
          <button className="icon-button sidebar-collapse" aria-label="收起侧边栏" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={18} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="书库导航">
          <button className={view === "library" && filter === "all" ? "active" : ""} onClick={() => { setView("library"); setFilter("all"); }}><Library size={18} /><span>我的书库</span></button>
          <button className={view === "library" && filter === "finished" ? "active" : ""} onClick={() => { setView("library"); setFilter("finished"); }}><CheckCircle2 size={18} /><span>已读</span></button>
          <button className={view === "notes" ? "active" : ""} onClick={() => setView("notes")}><NotebookPen size={18} /><span>整书笔记</span></button>
        </nav>
        <div className="sidebar-footer">
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings size={18} /><span>设置</span></button>
          {sidebarOpen && library.libraryDir && <div className="sidebar-sync"><span className="sync-dot" />书库目录已连接</div>}
        </div>
      </aside>

      <main className="main-view">
        {!sidebarOpen && <button className="icon-button sidebar-open-button" aria-label="展开侧边栏" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>}
        {message && <div className="app-message" role="status"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage(null)}><X size={15} /></button></div>}
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
      </main>
    </div>
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
      const matchesSearch = !query || `${book.title}${book.author}`.toLocaleLowerCase().includes(query);
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
          <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索书名或作者" aria-label="搜索书名或作者" />{search && <button aria-label="清除搜索" onClick={() => onSearch("")}><X size={15} /></button>}</label>
          <button className="primary-button" disabled={busy} onClick={onImport}><Plus size={18} />{busy ? "正在导入…" : "导入图书"}</button>
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
          <div className="empty-state"><BookMarked size={28} /><h3>{books.length ? "没有找到图书" : "书库还是空的"}</h3><p>{books.length ? "尝试更换搜索词。" : "点击右上角的“导入图书”，选择一个或多个 EPUB 文件。"}</p>{!books.length && <button className="secondary-button" onClick={onImport}>导入第一本书</button>}</div>
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
      <div className="cover-with-menu"><Cover book={book} /><button className="book-menu" aria-label={`${book.title}的更多操作`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); onToggleMenu(); }}><MoreHorizontal size={18} /></button>{menuOpen && <div className="context-menu book-action-menu" role="menu" onClick={(event) => event.stopPropagation()}><button onClick={onOpen}><BookOpen size={16} />打开图书</button><button onClick={onRename}><Pencil size={16} />重命名</button><button onClick={onChangeCover}><ImageIcon size={16} />更换封面</button><button onClick={onRestoreCover}><RotateCcw size={16} />恢复自动封面</button><button onClick={onSetFinished}><CheckCircle2 size={16} />{book.finished ? "标记为未读" : "标记为已读"}</button><div className="menu-separator" /><button className="destructive" onClick={onDelete}><Trash2 size={16} />从书库删除</button></div>}</div>
      <div className="book-meta"><h3>{book.title}</h3><p>{book.author}</p></div>
      <div className="card-progress"><span style={{ width: `${percent}%` }} /></div>
      <div className="progress-label"><span>{book.finished ? "已读" : percent ? `已阅读 ${percent}%` : "未读"}</span></div>
    </article>
  );
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
  const refreshRequestRef = useRef(0);
  const selectionVersionRef = useRef(0);
  const summaryDirtyRef = useRef(false);
  const reflectionDirtyRef = useRef(new Set<string>());
  const selectedBook = books.find((book) => book.id === selectedId) ?? null;

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
    } catch (reason) {
      if (requestId !== refreshRequestRef.current) return;
      onMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (requestId === refreshRequestRef.current) setLoadingNotes(false);
    }
  }, [onMessage, selectedId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!isDesktopApp()) return;
    let disposed = false;
    let timer: number | null = null;
    let unlisten: (() => void) | undefined;
    void listen("library-changed", () => {
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

  return (
    <div className="notes-workspace-page">
      <header className="notes-workspace-header"><div><p className="eyebrow">阅读与思考</p><h1>整书笔记</h1><p>每本书的总结、摘录和感悟都集中在这里，可随时编辑。</p></div></header>
      {!books.length ? <div className="empty-state"><NotebookPen size={28} /><h3>还没有可记录的图书</h3><p>导入一本 EPUB 并开始阅读后，就可以建立整书笔记。</p></div> : (
        <div className="notes-workspace">
          <aside className="notes-book-list" aria-label="选择图书">
            {books.map((book) => <button key={book.id} className={selectedId === book.id ? "active" : ""} onClick={() => selectBook(book.id)}><Cover book={book} mini /><span><strong>{book.title}</strong><small>{book.author}</small></span></button>)}
          </aside>
          <section className="notes-editor">
            <fieldset className="notes-editor-body" disabled={savingId !== null}>
            {loadingNotes || !selectedBook || !note || note.bookId !== selectedId ? <div className="notes-loading"><span className="loading-spinner" />正在读取笔记…</div> : <>
              <div className="notes-editor-title"><div><span>当前图书</span><h2>{selectedBook.title}</h2><p>{selectedBook.author} · {annotations.length} 条摘录</p></div><button className="secondary-button" onClick={() => onOpenQuote(selectedBook, null)}><BookOpen size={16} />打开图书</button></div>
              <label className="notes-summary-editor"><span>读后总结</span><textarea value={summary} onChange={(event) => { summaryDirtyRef.current = true; setSummary(event.target.value); }} placeholder="记录你对整本书的理解、问题和收获……" /><button className="primary-button" disabled={savingId === "summary" || summary === note.summary} onClick={() => void saveSummary()}><Save size={15} />{savingId === "summary" ? "保存中…" : "保存总结"}</button></label>
              <div className="notes-records"><div className="notes-records-heading"><h3>原文与感悟</h3><span>{annotations.length} 条</span></div>{annotations.length ? annotations.map((record) => <article key={record.id} className="notes-record-card"><button className="notes-original" onClick={() => onOpenQuote(selectedBook, record.cfiRange)}><Highlighter size={17} /><blockquote>{record.quote}</blockquote><span>回到原文</span></button><label><span>我的感悟</span><textarea value={reflectionDrafts[record.id] ?? ""} onChange={(event) => { reflectionDirtyRef.current.add(record.id); setReflectionDrafts((current) => ({ ...current, [record.id]: event.target.value })); }} placeholder="写下对这段原文的理解……" /></label><footer><small>{record.chapterTitle || record.chapterHref}</small><div><button className="quiet-button destructive-text" disabled={savingId === record.id} onClick={() => void deleteRecord(record)}><Trash2 size={14} />删除</button><button className="secondary-button" disabled={savingId === record.id || (reflectionDrafts[record.id] ?? "") === record.reflection} onClick={() => void saveReflection(record)}><Save size={14} />{savingId === record.id ? "保存中…" : "保存感悟"}</button></div></footer></article>) : <div className="notes-empty-large"><Highlighter size={24} /><p>还没有摘录。阅读时选中一段正文，即可添加高亮或记录感悟。</p></div>}</div>
            </>}
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
      <section className="settings-card">
        <div><h2>书库与同步</h2><p>书籍、进度和未来的批注会保存在这个普通文件夹中。</p></div>
        <div className="directory-row"><div><span>当前书库目录</span><code>{libraryDir ?? "尚未选择"}</code></div><button className="secondary-button" disabled={busy} onClick={onSelectLibrary}>{libraryDir ? "切换目录" : "选择目录"}</button></div>
        <div className="status-row">{libraryDir ? <><span className="sync-dot" />目录可用；可交由 OneDrive 等工具同步</> : "选择目录后才能导入图书"}</div>
      </section>
      <section className="settings-card appearance-card"><div><h2>外观</h2><p>应用于书库、整书笔记和设置，自动记住选择。阅读页的明亮、纸张和夜间主题独立设置。</p></div><div className="appearance-options" role="group" aria-label="应用外观"><button aria-pressed={appearance === "light"} onClick={() => onAppearanceChange("light")}><Sun size={18} />浅色</button><button aria-pressed={appearance === "dark"} onClick={() => onAppearanceChange("dark")}><Moon size={18} />深色</button></div></section>
    </div>
  );
}

export default App;
