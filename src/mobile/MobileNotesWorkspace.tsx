import { BookOpen, NotebookPen } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AnnotationRecord, BookRecord } from "../types";

type MobileNotesWorkspaceProps = {
  books: BookRecord[];
  selectedBook: BookRecord | null;
  annotations: AnnotationRecord[];
  summary: string;
  loading: boolean;
  onSelectBook: (bookId: string) => void;
  onOpenBook: () => void;
};

export function MobileNotesWorkspace({ books, selectedBook, annotations, summary, loading, onSelectBook, onOpenBook }: MobileNotesWorkspaceProps) {
  const selectedCoverRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    selectedCoverRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selectedBook?.id]);

  return (
    <div className="mobile-notes-workspace">
      <header className="mobile-notes-header"><h1>笔记</h1></header>

      {books.length ? <>
        <div className="mobile-notes-book-strip" role="list" aria-label="切换图书">
          {books.map((book) => <button
            key={book.id}
            ref={book.id === selectedBook?.id ? selectedCoverRef : null}
            type="button"
            role="listitem"
            className={book.id === selectedBook?.id ? "active" : ""}
            aria-label={`切换到《${book.title}》`}
            aria-pressed={book.id === selectedBook?.id}
            onClick={() => onSelectBook(book.id)}
          ><MobileNotesCover book={book} /></button>)}
        </div>

        {selectedBook ? <main className="mobile-notes-content">
          <section className="mobile-notes-current-book" aria-label="当前图书">
            <span>当前图书</span>
            <h2>{selectedBook.title}</h2>
            <div><small>{annotations.length} 条摘录</small><button type="button" onClick={onOpenBook}><BookOpen size={15} />打开图书</button></div>
          </section>

          {loading ? <div className="mobile-notes-loading"><span className="loading-spinner" />正在读取笔记…</div> : <>
            <section className="mobile-notes-section">
              <header><h2>读后总结</h2></header>
              {summary.trim() ? <p className="mobile-notes-summary">{summary}</p> : <p className="mobile-notes-empty-copy">还没有读后总结。</p>}
            </section>

            <section className="mobile-notes-section mobile-notes-annotations">
              <header><h2>原文与感悟</h2><span>{annotations.length} 条</span></header>
              {annotations.length ? <div className="mobile-notes-annotation-list">{annotations.map((annotation) => <article key={annotation.id}>
                <blockquote>{annotation.quote}</blockquote>
                <small>{annotation.chapterTitle || annotation.chapterHref || "正文"}</small>
                {annotation.reflection && <p>{annotation.reflection}</p>}
              </article>)}</div> : <p className="mobile-notes-empty-copy">还没有摘录。阅读时选中文字即可高亮或写下感悟。</p>}
            </section>
          </>}
        </main> : <MobileNotesEmpty />}
      </> : <MobileNotesEmpty />}
    </div>
  );
}

function MobileNotesCover({ book }: { book: BookRecord }) {
  return book.coverDataUrl ? <img src={book.coverDataUrl} alt="" /> : <span aria-hidden="true">{book.title.slice(0, 2)}</span>;
}

function MobileNotesEmpty() {
  return <div className="mobile-notes-empty"><NotebookPen size={28} /><h2>还没有可记录的图书</h2><p>导入一本 EPUB 并开始阅读后，就可以建立整书笔记。</p></div>;
}
