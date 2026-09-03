import { X } from "lucide-react";

type TocItem = { id: string; href: string; label: string; depth: number };

type MobileTocSheetProps = {
  bookTitle: string;
  items: TocItem[];
  onClose: () => void;
  onSelect: (item: TocItem) => void;
};

export function MobileTocSheet({ bookTitle, items, onClose, onSelect }: MobileTocSheetProps) {
  return <div className="mobile-reader-toc-layer" role="presentation">
    <button className="mobile-reader-toc-backdrop" aria-label="关闭目录" onClick={onClose} />
    <section className="mobile-reader-toc-sheet" role="dialog" aria-modal="true" aria-label="目录">
      <header className="mobile-reader-toc-header">
        <div><strong>目录</strong><span title={bookTitle}>{bookTitle}</span></div>
        <button aria-label="关闭目录" onClick={onClose}><X size={20} /></button>
      </header>
      <nav aria-label={`${bookTitle} 目录`}>
        {items.map((item) => <button key={`${item.id}-${item.href}`} data-toc-depth={item.depth} style={{ paddingInlineStart: `${14 + item.depth * 18}px` }} onClick={() => onSelect(item)}><span>{item.label}</span></button>)}
      </nav>
    </section>
  </div>;
}
