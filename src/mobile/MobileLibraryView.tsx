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
  const [actionSheetBookId, setActionSheetBookId] = useState<string | null>(null);
  const [actionSheetInteractive, setActionSheetInteractive] = useState(false);
  const continueBook = useMemo(() => books
    .filter((book) => book.progress > 0 && !book.finished)
    .sort((left, right) => right.progress - left.progress)[0], [books]);
  // TODO(Task 2B): choose the most recently opened unfinished book after that state exists.
  const actionSheetBook = useMemo(() => books.find((book) => book.id === actionSheetBookId) ?? null, [actionSheetBookId, books]);

  useEffect(() => {
    if (!actionSheetBookId) return;
    const readyTimer = window.setTimeout(() => setActionSheetInteractive(true), 250);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setActionSheetBookId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(readyTimer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionSheetBookId]);

  const openActionSheet = (book: BookRecord) => {
    setActionSheetInteractive(false);
    setActionSheetBookId(book.id);
  };
  const closeActionSheet = () => setActionSheetBookId(null);

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
        {books.length ? <div className="mobile-book-grid">{books.map((book) => <MobileBookCard key={book.id} book={book} onLongPress={() => openActionSheet(book)} onOpen={() => onOpenBook(book)} />)}</div> : <div className="mobile-library-empty"><BookMarked size={28} /><h3>书库还是空的</h3><p>点击右上角的“+”，选择一个或多个 EPUB 文件。</p><button onClick={onImport} disabled={busy}>{busy ? "导入中…" : "导入第一本书"}</button></div>}
      </section>

      {actionSheetBook && <MobileBookActionSheet book={actionSheetBook} interactive={actionSheetInteractive} onClose={closeActionSheet} onOpen={() => { closeActionSheet(); onOpenBook(actionSheetBook); }} onSetFinished={() => { closeActionSheet(); onSetFinished(actionSheetBook); }} onDelete={() => { closeActionSheet(); onDelete(actionSheetBook); }} onRemoveLocal={() => { closeActionSheet(); onRemoveLocal(actionSheetBook); }} />}
    </div>
  );
}

function MobileBookCard({ book, onLongPress, onOpen }: { book: BookRecord; onLongPress: () => void; onOpen: () => void }) {
  const progress = Math.round(book.progress * 100);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressReadyRef = useRef(false);
  const suppressClickRef = useRef(false);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  const cancelLongPress = () => {
    clearLongPressTimer();
    longPressReadyRef.current = false;
    pressStartRef.current = null;
  };
  const startLongPress = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") return;
    cancelLongPress();
    pressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressReadyRef.current = true;
    }, 500);
  };
  const trackLongPressMovement = (event: React.PointerEvent<HTMLElement>) => {
    const start = pressStartRef.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelLongPress();
  };
  const finishLongPress = () => {
    clearLongPressTimer();
    pressStartRef.current = null;
    if (!longPressReadyRef.current) return;
    longPressReadyRef.current = false;
    suppressClickRef.current = true;
    onLongPress();
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  return <article className="mobile-book-card" onClick={(event) => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; return; } onOpen(); }} onPointerDown={startLongPress} onPointerMove={trackLongPressMovement} onPointerLeave={cancelLongPress} onPointerUp={finishLongPress} onPointerCancel={cancelLongPress} onContextMenu={(event) => { event.preventDefault(); onLongPress(); }} tabIndex={0} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) onOpen(); }}>
    <div className="mobile-book-cover-wrap"><MobileBookCover book={book} className="mobile-book-cover" />{progress > 0 && <span className="mobile-book-progress"><span style={{ width: `${progress}%` }} /></span>}</div>
    <h3>{book.title}</h3>
  </article>;
}

function MobileBookActionSheet({ book, interactive, onClose, onOpen, onSetFinished, onDelete, onRemoveLocal }: { book: BookRecord; interactive: boolean; onClose: () => void; onOpen: () => void; onSetFinished: () => void; onDelete: () => void; onRemoveLocal: () => void }) {
  return <div className="mobile-book-action-sheet-layer" role="presentation">
    <button className="mobile-book-action-sheet-backdrop" aria-label="关闭图书操作菜单" onClick={onClose} />
    <section className="mobile-book-action-sheet" aria-label={`${book.title}的图书操作`}>
      <div className="mobile-book-action-sheet-title">{book.title}</div>
      <button disabled={!interactive} onClick={onOpen}><BookOpen size={18} />打开图书</button>
      <button disabled={!interactive} onClick={onSetFinished}><CheckCircle2 size={18} />{book.finished ? "标记为未读" : "标记为已读"}</button>
      {book.cached && <button disabled={!interactive} onClick={onRemoveLocal}>移除本机下载</button>}
      <button className="destructive" disabled={!interactive} onClick={onDelete}><Trash2 size={18} />从书库删除</button>
      <button className="mobile-book-action-sheet-cancel" onClick={onClose}>取消</button>
    </section>
  </div>;
}

function MobileBookCover({ book, className }: { book: BookRecord; className: string }) {
  if (book.coverDataUrl) return <div className={`${className} mobile-cover-image-shell`}><img src={book.coverDataUrl} alt={`${book.title}封面`} /></div>;
  const variants = ["mobile-cover-forest", "mobile-cover-violet", "mobile-cover-clay", "mobile-cover-blue", "mobile-cover-sand"];
  const variant = variants[book.id.charCodeAt(0) % variants.length];
  return <div className={`${className} ${variant}`}><span>{book.title.slice(0, 6)}</span></div>;
}
