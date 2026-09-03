import { ArrowRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AnnotationRecord } from "../../types";

type MobileReaderNotesSheetProps = {
  bookTitle: string;
  annotations: AnnotationRecord[];
  onClose: () => void;
  onOpenQuote: (annotation: AnnotationRecord) => void;
  onAddReflection: (annotation: AnnotationRecord, scrollTop: number) => void;
  onOpenFullNotes: () => void;
  scrollRestoreVersion: number;
};

type IndexedAnnotation = { annotation: AnnotationRecord; index: number };

/**
 * Keeps the source order when a malformed CFI cannot be compared. The caller
 * supplies epub.js' CFI comparator so this UI component stays renderer-free.
 */
export function sortAnnotationsByReadingOrder(
  annotations: AnnotationRecord[],
  compareCfi: (left: string, right: string) => number,
) {
  return annotations
    .map((annotation, index): IndexedAnnotation => ({ annotation, index }))
    .sort((left, right) => {
      try {
        const result = compareCfi(left.annotation.cfiRange, right.annotation.cfiRange);
        return Number.isFinite(result) && result !== 0 ? result : left.index - right.index;
      } catch {
        return left.index - right.index;
      }
    })
    .map(({ annotation }) => annotation);
}

export function MobileReaderNotesSheet({ bookTitle, annotations, onClose, onOpenQuote, onAddReflection, onOpenFullNotes, scrollRestoreVersion }: MobileReaderNotesSheetProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef(0);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const frame = requestAnimationFrame(() => { list.scrollTop = savedScrollTopRef.current; });
    return () => cancelAnimationFrame(frame);
  }, [scrollRestoreVersion]);

  const startReflection = (annotation: AnnotationRecord) => {
    savedScrollTopRef.current = listRef.current?.scrollTop ?? 0;
    onAddReflection(annotation, savedScrollTopRef.current);
  };

  return <div className="mobile-reader-notes-layer" role="presentation">
    <button className="mobile-reader-notes-backdrop" aria-label="关闭笔记" onClick={onClose} />
    <section className="mobile-reader-notes-sheet" role="dialog" aria-modal="true" aria-label="笔记">
      <header className="mobile-reader-notes-header">
        <div><strong>笔记</strong><span title={bookTitle}>{bookTitle}</span></div>
        <button aria-label="关闭笔记" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="mobile-reader-notes-list" ref={listRef}>
        {annotations.length === 0
          ? <div className="mobile-reader-notes-empty"><strong>还没有摘录</strong><span>阅读时长按文字，可以高亮或写下感悟。</span></div>
          : annotations.map((annotation) => <article className="mobile-reader-note" key={annotation.id}>
            <div className="mobile-reader-note-quote">
              <span className="mobile-reader-note-label">摘录</span>
              <p>“{annotation.quote}”</p>
            </div>
            <div className="mobile-reader-note-chapter"><small>{annotation.chapterTitle || "正文"}</small><button onClick={() => onOpenQuote(annotation)}>回到原文</button></div>
            {annotation.reflection.trim()
              ? <div className="mobile-reader-note-reflection"><div><span>感悟</span><button onClick={() => startReflection(annotation)}>编辑</button></div><p>{annotation.reflection}</p></div>
              : <button className="mobile-reader-add-reflection" onClick={() => startReflection(annotation)}>+ 补充感悟</button>}
          </article>)}
      </div>
      <button className="mobile-reader-open-full-notes" onClick={onOpenFullNotes}>查看完整笔记 <ArrowRight size={16} /></button>
    </section>
  </div>;
}
