import { BookOpen, MoreHorizontal, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sortAnnotationsByReadingOrder } from "../reader/ui/MobileReaderNotesSheet";
import type { AnnotationRecord, BookRecord } from "../types";

type MobileNotesWorkspaceProps = {
  books: BookRecord[];
  selectedBook: BookRecord | null;
  annotations: AnnotationRecord[];
  summary: string;
  savedSummary: string;
  reflectionDrafts: Record<string, string>;
  loading: boolean;
  savingId: string | null;
  onSelectBook: (bookId: string) => void;
  onOpenBook: () => void;
  onOpenQuote: (annotation: AnnotationRecord) => void;
  onSummaryChange: (value: string) => void;
  onCancelSummary: () => void;
  onSaveSummary: () => Promise<boolean>;
  onReflectionChange: (annotation: AnnotationRecord, value: string) => void;
  onCancelReflection: (annotation: AnnotationRecord) => void;
  onSaveReflection: (annotation: AnnotationRecord) => Promise<boolean>;
  onDeleteAnnotation: (annotation: AnnotationRecord) => Promise<boolean>;
};

export function MobileNotesWorkspace(props: MobileNotesWorkspaceProps) {
  const { books, selectedBook, annotations, summary, savedSummary, reflectionDrafts, loading, savingId, onSelectBook, onOpenBook, onOpenQuote, onSummaryChange, onCancelSummary, onSaveSummary, onReflectionChange, onCancelReflection, onSaveReflection, onDeleteAnnotation } = props;
  const selectedCoverRef = useRef<HTMLButtonElement | null>(null);
  const [summaryEditing, setSummaryEditing] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [actionAnnotation, setActionAnnotation] = useState<AnnotationRecord | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<AnnotationRecord | null>(null);
  const [compareCfi, setCompareCfi] = useState<((left: string, right: string) => number) | null>(null);
  const sortedAnnotations = useMemo(() => compareCfi ? sortAnnotationsByReadingOrder(annotations, compareCfi) : annotations, [annotations, compareCfi]);

  useEffect(() => {
    selectedCoverRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
    setSummaryEditing(false); setEditingAnnotationId(null); setActionAnnotation(null); setDeleteCandidate(null);
  }, [selectedBook?.id]);

  useEffect(() => {
    let disposed = false;
    void import("epubjs").then(({ EpubCFI }) => {
      if (!disposed) setCompareCfi(() => (left: string, right: string) => new EpubCFI().compare(left, right));
    }).catch(() => { /* Malformed or unavailable renderer support keeps source order. */ });
    return () => { disposed = true; };
  }, []);

  const startSummaryEdit = () => { setEditingAnnotationId(null); setSummaryEditing(true); };
  const cancelSummaryEdit = () => { onCancelSummary(); setSummaryEditing(false); };
  const saveSummary = async () => { if (await onSaveSummary()) setSummaryEditing(false); };
  const startReflectionEdit = (annotation: AnnotationRecord) => { setSummaryEditing(false); setEditingAnnotationId(annotation.id); };
  const cancelReflectionEdit = (annotation: AnnotationRecord) => { onCancelReflection(annotation); setEditingAnnotationId(null); };
  const saveReflection = async (annotation: AnnotationRecord) => { if (await onSaveReflection(annotation)) setEditingAnnotationId(null); };
  const confirmDelete = async () => { if (deleteCandidate && await onDeleteAnnotation(deleteCandidate)) setDeleteCandidate(null); };

  return <div className="mobile-notes-workspace">
    <header className="mobile-notes-header"><h1>笔记</h1></header>
    {books.length ? <>
      <div className="mobile-notes-book-strip" role="list" aria-label="切换图书">
        {books.map((book) => <button key={book.id} ref={book.id === selectedBook?.id ? selectedCoverRef : null} type="button" role="listitem" className={book.id === selectedBook?.id ? "active" : ""} aria-label={`切换到《${book.title}》`} aria-pressed={book.id === selectedBook?.id} onClick={() => onSelectBook(book.id)}><MobileNotesCover book={book} /></button>)}
      </div>
      {selectedBook ? <main className="mobile-notes-content">
        <section className="mobile-notes-current-book" aria-label="当前图书"><span>当前图书</span><h2>{selectedBook.title}</h2><div><small>{annotations.length} 条摘录</small><button type="button" onClick={onOpenBook}><BookOpen size={15} />打开图书</button></div></section>
        {loading ? <div className="mobile-notes-loading"><span className="loading-spinner" />正在读取笔记…</div> : <>
          <section className="mobile-notes-section mobile-notes-summary-section">
            <header><h2>读后总结</h2>{!summaryEditing && <button type="button" onClick={startSummaryEdit}>{summary.trim() ? "编辑" : "+ 写下读后总结"}</button>}</header>
            {summaryEditing ? <div className="mobile-notes-summary-editor"><textarea autoFocus value={summary} onChange={(event) => onSummaryChange(event.target.value)} placeholder="记录你对整本书的理解、问题和收获……" /><footer><button type="button" onClick={cancelSummaryEdit}>取消</button><button type="button" className="mobile-notes-save" disabled={savingId === "summary" || summary === savedSummary} onClick={() => void saveSummary()}>{savingId === "summary" ? "保存中…" : "保存"}</button></footer></div> : summary.trim() ? <p className="mobile-notes-summary">{summary}</p> : <p className="mobile-notes-empty-copy">还没有读后总结。</p>}
          </section>
          <section className="mobile-notes-section mobile-notes-annotations">
            <header><h2>原文与感悟</h2><span>{annotations.length} 条</span></header>
            {sortedAnnotations.length ? <div className="mobile-notes-annotation-list">{sortedAnnotations.map((annotation) => <MobileNoteCard key={annotation.id} annotation={annotation} draft={reflectionDrafts[annotation.id] ?? annotation.reflection} editing={editingAnnotationId === annotation.id} saving={savingId === annotation.id} onStartEdit={() => startReflectionEdit(annotation)} onChange={(value) => onReflectionChange(annotation, value)} onCancel={() => cancelReflectionEdit(annotation)} onSave={() => void saveReflection(annotation)} onOpenQuote={() => onOpenQuote(annotation)} onOpenActions={() => setActionAnnotation(annotation)} />)}</div> : <p className="mobile-notes-empty-copy">还没有摘录。阅读时选中文字即可高亮或写下感悟。</p>}
          </section>
        </>}
      </main> : <MobileNotesEmpty />}
    </> : <MobileNotesEmpty />}
    {actionAnnotation && <MobileNoteActionSheet annotation={actionAnnotation} onClose={() => setActionAnnotation(null)} onEdit={() => { setActionAnnotation(null); startReflectionEdit(actionAnnotation); }} onDelete={() => { setActionAnnotation(null); setDeleteCandidate(actionAnnotation); }} />}
    {deleteCandidate && <MobileNoteDeleteDialog busy={savingId === deleteCandidate.id} onCancel={() => setDeleteCandidate(null)} onConfirm={() => void confirmDelete()} />}
  </div>;
}

function MobileNoteCard({ annotation, draft, editing, saving, onStartEdit, onChange, onCancel, onSave, onOpenQuote, onOpenActions }: { annotation: AnnotationRecord; draft: string; editing: boolean; saving: boolean; onStartEdit: () => void; onChange: (value: string) => void; onCancel: () => void; onSave: () => void; onOpenQuote: () => void; onOpenActions: () => void }) {
  const cardRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (!editing) return;
    const reveal = () => cardRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const frame = requestAnimationFrame(() => { reveal(); textareaRef.current?.focus(); });
    window.visualViewport?.addEventListener("resize", reveal);
    return () => { cancelAnimationFrame(frame); window.visualViewport?.removeEventListener("resize", reveal); };
  }, [editing]);
  return <article className={`mobile-note-card ${editing ? "editing" : ""}`} ref={cardRef}>
    <small className="mobile-note-card-chapter">{annotation.chapterTitle || annotation.chapterHref || "正文"}</small><blockquote>{annotation.quote}</blockquote>
    {editing ? <div className="mobile-note-card-editor"><textarea ref={textareaRef} value={draft} onChange={(event) => onChange(event.target.value)} placeholder="写下你对这段摘录的理解、联想或批注……" /><footer><button type="button" onClick={onOpenQuote}>回到原文</button><button type="button" onClick={onCancel}>取消</button><button type="button" className="mobile-notes-save" disabled={saving || draft === annotation.reflection} onClick={onSave}>{saving ? "保存中…" : "保存"}</button></footer></div> : <>
      {annotation.reflection.trim() ? <div className="mobile-note-card-reflection"><span>我的感悟</span><p>{annotation.reflection}</p></div> : <button type="button" className="mobile-note-add-reflection" onClick={onStartEdit}><Plus size={16} />添加感悟</button>}
      <footer className="mobile-note-card-actions"><button type="button" onClick={onOpenQuote}>回到原文</button><button type="button" aria-label="更多笔记操作" onClick={onOpenActions}><MoreHorizontal size={20} /></button></footer>
    </>}
  </article>;
}

function MobileNoteActionSheet({ annotation, onClose, onEdit, onDelete }: { annotation: AnnotationRecord; onClose: () => void; onEdit: () => void; onDelete: () => void }) { return <div className="mobile-note-action-layer" role="presentation"><button className="mobile-note-action-backdrop" aria-label="关闭笔记操作" onClick={onClose} /><section className="mobile-note-action-sheet" role="dialog" aria-modal="true" aria-label="笔记操作"><button type="button" onClick={onEdit}>{annotation.reflection.trim() ? "编辑感悟" : "写感悟"}</button><button type="button" className="destructive" onClick={onDelete}><Trash2 size={17} />删除摘录</button><button type="button" className="mobile-note-action-cancel" onClick={onClose}>取消</button></section></div>; }
function MobileNoteDeleteDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="mobile-note-delete-layer" role="presentation"><button className="mobile-note-delete-backdrop" aria-label="取消删除" onClick={onCancel} /><section className="mobile-note-delete-dialog" role="alertdialog" aria-modal="true" aria-label="删除这条摘录"><strong>删除这条摘录？</strong><p>高亮和对应感悟都会被移除。</p><footer><button type="button" onClick={onCancel} disabled={busy}>取消</button><button type="button" className="destructive" onClick={onConfirm} disabled={busy}>{busy ? "删除中…" : "删除"}</button></footer></section></div>; }
function MobileNotesCover({ book }: { book: BookRecord }) { return book.coverDataUrl ? <img src={book.coverDataUrl} alt="" /> : <span aria-hidden="true">{book.title.slice(0, 2)}</span>; }
function MobileNotesEmpty() { return <div className="mobile-notes-empty"><NotebookPen size={28} /><h2>还没有可记录的图书</h2><p>导入一本 EPUB 并开始阅读后，就可以建立整书笔记。</p></div>; }
