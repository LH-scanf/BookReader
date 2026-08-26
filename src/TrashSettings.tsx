import { useEffect, useState } from "react";
import { listDeletedBooks, restoreDeletedBook, subscribeLibraryChanges } from "./library-api";
import type { BookRecord } from "./types";

export default function TrashSettings() {
  const [books, setBooks] = useState<BookRecord[]>([]); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false; let cleanup: (() => void) | undefined;
    const refresh = () => { void listDeletedBooks().then((value) => { if (!disposed) setBooks(value); }).catch((reason) => { if (!disposed) setError(String(reason)); }); };
    refresh(); void subscribeLibraryChanges(refresh).then((fn) => { if (disposed) fn(); else cleanup = fn; });
    return () => { disposed = true; cleanup?.(); };
  }, []);
  return <section className="settings-card trash-settings"><h2>回收站</h2><p>删除的图书暂时隐藏。EPUB、封面、进度和笔记保留，不提供永久删除。</p>
    {!books.length && <p>没有已删除的图书。</p>}
    {books.map((book) => <div className="trash-row" key={book.id}><span>{book.title}</span><button className="secondary-button" disabled={busy} onClick={() => {
      setBusy(true); setError(""); void restoreDeletedBook(book.id).then(() => listDeletedBooks()).then(setBooks).catch((reason) => setError(String(reason))).finally(() => setBusy(false));
    }}>恢复</button></div>)}{error && <p role="alert">{error}</p>}</section>;
}
