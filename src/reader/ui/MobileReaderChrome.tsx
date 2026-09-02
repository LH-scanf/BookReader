import { ChevronLeft, Info, List, MoreHorizontal, NotebookPen, Search, SlidersHorizontal, X } from "lucide-react";

type MobileReaderChromeProps = {
  visible: boolean; moreOpen: boolean; infoOpen: boolean; title: string; author: string; chapter: string;
  onBack: () => void; onToggleMore: () => void; onOpenSearch: () => void; onOpenInfo: () => void; onCloseInfo: () => void; onOpenToc: () => void; onOpenSettings: () => void; onOpenNotes: () => void;
};

export function MobileReaderChrome({ visible, moreOpen, infoOpen, title, author, chapter, onBack, onToggleMore, onOpenSearch, onOpenInfo, onCloseInfo, onOpenToc, onOpenSettings, onOpenNotes }: MobileReaderChromeProps) {
  if (!visible) return null;
  return <>
    <header className="mobile-reader-top-chrome"><button aria-label="返回书库" onClick={onBack}><ChevronLeft size={25} /></button><div><strong title={title}>{title}</strong><span title={chapter}>{chapter}</span></div><button aria-label="更多阅读功能" aria-expanded={moreOpen} onClick={onToggleMore}><MoreHorizontal size={22} /></button></header>
    <nav className="mobile-reader-bottom-chrome" aria-label="阅读控制"><button onClick={onOpenToc}><List size={18} /><span>目录</span></button><button onClick={onOpenSettings}><SlidersHorizontal size={18} /><span>Aa</span></button><button onClick={onOpenNotes}><NotebookPen size={18} /><span>笔记</span></button></nav>
    {moreOpen && <div className="mobile-reader-more-layer" role="presentation"><button className="mobile-reader-more-backdrop" aria-label="关闭更多菜单" onClick={onToggleMore} /><div className="mobile-reader-more-menu" role="menu"><button role="menuitem" onClick={onOpenSearch}><Search size={18} />书内搜索</button><button role="menuitem" onClick={onOpenInfo}><Info size={18} />图书信息</button></div></div>}
    {infoOpen && <div className="mobile-reader-info-layer" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onCloseInfo(); }}><section className="mobile-reader-info-sheet" aria-label="图书信息"><button className="mobile-reader-info-close" aria-label="关闭图书信息" onClick={onCloseInfo}><X size={18} /></button><span>图书信息</span><strong>{title}</strong>{author && <small>{author}</small>}</section></div>}
  </>;
}
