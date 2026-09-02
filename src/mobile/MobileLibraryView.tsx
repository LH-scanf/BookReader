import { BookMarked, BookOpen, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BookRecord } from "../types";

type MobileLibraryViewProps = {
  books: BookRecord[];
  busy: boolean;
  onImport: () => void;
  onOpenBook: (book: BookRecord) => void;
  onSetFinished: (book: BookRecord) => void;
  onDelete: (book: BookRecord) => void;
  onRemoveLocal: (book: BookRecord) => void;
};

export function MobileLibraryView({ books, busy, onImport, onOpenBook, onSetFinished, onDelete, onRemoveLocal }: MobileLibraryViewProps) {
  const [menuBookId, setMenuBookId] = useState<string | null>(null);
  const continueBook = useMemo(() => books
    .filter((book) => book.progress > 0 && !book.finished)
    .sort((left, right) => right.progress - left.progress)[0], [books]);
  // TODO(Task 2B): choose the most recently opened unfinished book after that state exists.

  useEffect(() => {
    if (!menuBookId) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuBookId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuBookId]);

  return (
    <div className="mobile-library-page">
      <header className="mobile-library-header">
        <h1>书库</h1>
        <button className="mobile-library-import" aria-label="导入图书" disabled={busy} onClick={onImport}><Plus size={22} /></button>
      </header>

      {continueBook && <section className="mobile-continue-section" aria-label="继续阅读">
        <h2>继续阅读</h2>
        <button className="mobile-continue-card" onClick={() => onOpenBook(continueBook)}>
          <MobileBookCover book={continueBook} className="mobile-continue-cover" />
          <span className="mobile-continue-copy"><strong>{continueBook.title}</strong><span className="mobile-continue-progress"><span style={{ width: `${continueBook.progress * 100}%` }} /></span><small>{Math.round(continueBook.progress * 100)}%</small></span>
        </button>
      </section>}

      <section className="mobile-bookshelf">
        <h2>我的书架</h2>
        {books.length ? <div className="mobile-book-grid">{books.map((book) => <MobileBookCard key={book.id} book={book} menuOpen={menuBookId === book.id} onToggleMenu={() => setMenuBookId((current) => current === book.id ? null : book.id)} onOpen={() => { setMenuBookId(null); onOpenBook(book); }} onSetFinished={() => { setMenuBookId(null); onSetFinished(book); }} onDelete={() => { setMenuBookId(null); onDelete(book); }} onRemoveLocal={() => { setMenuBookId(null); onRemoveLocal(book); }} />)}</div> : <div className="mobile-library-empty"><BookMarked size={28} /><h3>书库还是空的</h3><p>点击右上角的“+”，选择一个或多个 EPUB 文件。</p><button onClick={onImport} disabled={busy}>{busy ? "导入中…" : "导入第一本书"}</button></div>}
      </section>

      {menuBookId && <button className="menu-backdrop" aria-label="关闭菜单" onClick={() => setMenuBookId(null)} />}
    </div>
  );
}

function MobileBookCard({ book, menuOpen, onToggleMenu, onOpen, onSetFinished, onDelete, onRemoveLocal }: { book: BookRecord; menuOpen: boolean; onToggleMenu: () => void; onOpen: () => void; onSetFinished: () => void; onDelete: () => void; onRemoveLocal: () => void }) {
  const progress = Math.round(book.progress * 100);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  const startLongPress = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") return;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredRef.current = true;
      if (!menuOpen) onToggleMenu();
    }, 500);
  };
  const finishLongPress = () => {
    clearLongPress();
    if (longPressTriggeredRef.current) window.setTimeout(() => { longPressTriggeredRef.current = false; }, 0);
  };

  return <article className="mobile-book-card" onClick={(event) => { if (longPressTriggeredRef.current) { event.preventDefault(); event.stopPropagation(); longPressTriggeredRef.current = false; return; } onOpen(); }} onPointerDown={startLongPress} onPointerMove={clearLongPress} onPointerLeave={clearLongPress} onPointerUp={finishLongPress} onPointerCancel={clearLongPress} onContextMenu={(event) => { event.preventDefault(); if (!menuOpen) onToggleMenu(); }} tabIndex={0} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) onOpen(); }}>
    <div className="mobile-book-cover-wrap"><MobileBookCover book={book} className="mobile-book-cover" />{progress > 0 && <span className="mobile-book-progress"><span style={{ width: `${progress}%` }} /></span>}{menuOpen && <div className="context-menu mobile-book-action-menu" role="menu" onClick={(event) => event.stopPropagation()}><button onClick={onOpen}><BookOpen size={16} />打开图书</button><button onClick={onSetFinished}><CheckCircle2 size={16} />{book.finished ? "标记为未读" : "标记为已读"}</button>{book.cached && <button onClick={onRemoveLocal}>移除本机下载</button>}<div className="menu-separator" /><button className="destructive" onClick={onDelete}><Trash2 size={16} />从书库删除</button></div>}</div>
    <h3>{book.title}</h3>
  </article>;
}

function MobileBookCover({ book, className }: { book: BookRecord; className: string }) {
  if (book.coverDataUrl) return <div className={`${className} mobile-cover-image-shell`}><img src={book.coverDataUrl} alt={`${book.title}封面`} /></div>;
  const variants = ["mobile-cover-forest", "mobile-cover-violet", "mobile-cover-clay", "mobile-cover-blue", "mobile-cover-sand"];
  const variant = variants[book.id.charCodeAt(0) % variants.length];
  return <div className={`${className} ${variant}`}><span>{book.title.slice(0, 6)}</span></div>;
}
