import { useEffect, useState, type CSSProperties } from "react";

type ReflectionDraft = {
  quote: string;
  reflection: string;
};

type MobileReaderReflectionEditorProps = {
  draft: ReflectionDraft;
  onChange: (reflection: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

type VisualViewportBounds = { height: number; top: number };

export function MobileReaderReflectionEditor({ draft, onChange, onCancel, onSave }: MobileReaderReflectionEditorProps) {
  const [viewport, setViewport] = useState<VisualViewportBounds | null>(null);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    const updateViewport = () => setViewport({ height: visualViewport.height, top: visualViewport.offsetTop });
    updateViewport();
    visualViewport.addEventListener("resize", updateViewport);
    visualViewport.addEventListener("scroll", updateViewport);
    return () => {
      visualViewport.removeEventListener("resize", updateViewport);
      visualViewport.removeEventListener("scroll", updateViewport);
    };
  }, []);

  const viewportStyle: CSSProperties | undefined = viewport
    ? { top: `${viewport.top}px`, height: `${viewport.height}px`, bottom: "auto" }
    : undefined;

  return <section className="mobile-reader-reflection-editor" style={viewportStyle} role="dialog" aria-modal="true" aria-label="笔记">
    <header className="mobile-reader-reflection-editor-header">
      <button onClick={onCancel}>取消</button>
      <strong>笔记</strong>
      <button className="mobile-reader-reflection-save" onClick={onSave}>完成</button>
    </header>
    <div className="mobile-reader-reflection-editor-content">
      <section><span>所选原文</span><blockquote>{draft.quote}</blockquote></section>
      <label>笔记<textarea autoFocus value={draft.reflection} onChange={(event) => onChange(event.target.value)} placeholder="写下感悟……" /></label>
    </div>
  </section>;
}
