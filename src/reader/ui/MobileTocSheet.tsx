import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { resolveEpubRelativePath } from "../reader-ui";

type TocItem = { id: string; href: string; label: string; depth: number };

type MobileTocSheetProps = {
  bookTitle: string;
  items: TocItem[];
  currentHref: string;
  currentChapter: string;
  onClose: () => void;
  onSelect: (item: TocItem) => void;
};

function normalizedEpubPath(href: string) {
  const path = resolveEpubRelativePath("", href.split("#")[0]).replace(/^\/+/, "");
  try { return decodeURIComponent(path); }
  catch { return path; }
}

export function matchesCurrentTocItem(currentHref: string, itemHref: string) {
  if (!currentHref || !itemHref) return false;
  const currentPath = normalizedEpubPath(currentHref);
  const itemPath = normalizedEpubPath(itemHref);
  return currentPath === itemPath || currentPath.endsWith(`/${itemPath}`) || itemPath.endsWith(`/${currentPath}`);
}

export function findCurrentTocItem(items: TocItem[], currentHref: string, currentChapter: string) {
  const hrefMatches = items.filter((item) => matchesCurrentTocItem(currentHref, item.href));
  const chapterMatches = hrefMatches.filter((item) => item.label.trim() === currentChapter.trim());
  if (chapterMatches.length === 1) return chapterMatches[0];
  return hrefMatches.length === 1 ? hrefMatches[0] : undefined;
}

export function MobileTocSheet({ bookTitle, items, currentHref, currentChapter, onClose, onSelect }: MobileTocSheetProps) {
  const listRef = useRef<HTMLElement>(null);
  const currentItemRef = useRef<HTMLButtonElement>(null);
  const currentItem = findCurrentTocItem(items, currentHref, currentChapter);

  useEffect(() => {
    const list = listRef.current;
    const item = currentItemRef.current;
    if (!list || !item) return;
    const frame = requestAnimationFrame(() => {
      const targetTop = item.offsetTop - list.clientHeight * 0.36;
      const maximum = Math.max(0, list.scrollHeight - list.clientHeight);
      list.scrollTop = Math.max(0, Math.min(maximum, targetTop));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div className="mobile-reader-toc-layer" role="presentation">
    <button className="mobile-reader-toc-backdrop" aria-label="关闭目录" onClick={onClose} />
    <section className="mobile-reader-toc-sheet" role="dialog" aria-modal="true" aria-label="目录">
      <header className="mobile-reader-toc-header">
        <div><strong>目录</strong><span title={bookTitle}>{bookTitle}</span></div>
        <button aria-label="关闭目录" onClick={onClose}><X size={20} /></button>
      </header>
      <nav ref={listRef} aria-label={`${bookTitle} 目录`}>
        {items.map((item) => {
          const current = item === currentItem;
          return <button key={`${item.id}-${item.href}`} ref={current ? currentItemRef : undefined} data-current={current || undefined} data-toc-depth={item.depth} style={{ paddingInlineStart: `${14 + item.depth * 18}px` }} onClick={() => onSelect(item)}><span>{item.label}</span></button>;
        })}
      </nav>
    </section>
  </div>;
}
