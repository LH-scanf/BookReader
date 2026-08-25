import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Menu,
  Moon,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import ePub, { type Book, type NavItem, type Rendition } from "epubjs";
import { useEffect, useRef, useState } from "react";
import { persistProgress, readBookBytes } from "./library-api";
import type { BookRecord, ReaderTheme, ReadingMode } from "./types";

type ReaderProps = {
  book: BookRecord;
  onBack: () => void;
  onProgress: (bookId: string, percentage: number, cfi: string | null, chapterHref: string | null) => void;
};

type LocationEvent = {
  start: { cfi: string; href: string; percentage?: number };
};

function flattenToc(items: NavItem[], depth = 0): Array<NavItem & { depth: number }> {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flattenToc(item.subitems ?? [], depth + 1),
  ]);
}

export default function EpubReader({ book, onBack, onProgress }: ReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const epubBookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const currentCfiRef = useRef<string | null>(book.cfi);
  const lastProgressRef = useRef<{ cfi: string; href: string; percentage: number } | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readingMode, setReadingMode] = useState<ReadingMode>(() => localStorage.getItem("reader-mode") === "scroll" ? "scroll" : "paged");
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(() => {
    const stored = localStorage.getItem("reader-theme");
    return stored === "light" || stored === "dark" ? stored : "paper";
  });
  const themeRef = useRef<ReaderTheme>(readerTheme);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("reader-font-size")) || 18);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [chapter, setChapter] = useState("正在载入");
  const [percentage, setPercentage] = useState(book.progress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const viewer = viewerRef.current;
    if (!viewer) return;

    setLoading(true);
    setError(null);
    viewer.replaceChildren();

    void (async () => {
      try {
        const data = await readBookBytes(book.id);
        if (cancelled) return;
        const epubBook = ePub(data);
        epubBookRef.current = epubBook;
        const navigation = await epubBook.loaded.navigation;
        if (cancelled) return;
        setToc(navigation.toc ?? []);
        await epubBook.locations.generate(1400);

        const rendition = epubBook.renderTo(viewer, {
          width: "100%",
          height: "100%",
          flow: readingMode === "paged" ? "paginated" : "scrolled-doc",
          manager: "default",
          spread: "none",
          infinite: false,
        });
        renditionRef.current = rendition;
        registerBaseTheme(rendition);
        applyReaderTheme(rendition, themeRef.current, viewer);
        rendition.themes.fontSize(`${fontSize}px`);
        rendition.on("rendered", () => applyReaderTheme(rendition, themeRef.current, viewer));

        rendition.on("relocated", (location: LocationEvent) => {
          const cfi = location.start.cfi;
          const href = location.start.href;
          const calculated = location.start.percentage ?? epubBook.locations.percentageFromCfi(cfi) ?? 0;
          const nextPercentage = Math.min(1, Math.max(0, calculated));
          currentCfiRef.current = cfi;
          lastProgressRef.current = { cfi, href, percentage: nextPercentage };
          setPercentage(nextPercentage);
          const current = flattenToc(navigation.toc ?? []).find((item) => href.includes(item.href.split("#")[0]));
          setChapter(current?.label?.trim() || href || "正文");
          onProgress(book.id, nextPercentage, cfi, href);
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => {
            void persistProgress({ bookId: book.id, cfi, chapterHref: href, percentage: nextPercentage });
          }, 500);
        });

        await rendition.display(currentCfiRef.current ?? undefined);
        if (!cancelled) setLoading(false);
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      const lastProgress = lastProgressRef.current;
      if (lastProgress) {
        void persistProgress({ bookId: book.id, cfi: lastProgress.cfi, chapterHref: lastProgress.href, percentage: lastProgress.percentage });
      }
      renditionRef.current?.destroy();
      epubBookRef.current?.destroy();
      renditionRef.current = null;
      epubBookRef.current = null;
    };
  }, [book.id, readingMode]);

  useEffect(() => {
    localStorage.setItem("reader-theme", readerTheme);
    themeRef.current = readerTheme;
    const rendition = renditionRef.current;
    if (!rendition) return;
    applyReaderTheme(rendition, readerTheme, viewerRef.current);
  }, [readerTheme]);

  useEffect(() => {
    localStorage.setItem("reader-font-size", String(fontSize));
    renditionRef.current?.themes.fontSize(`${fontSize}px`);
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem("reader-mode", readingMode);
  }, [readingMode]);

  const goTo = async (href: string, label: string) => {
    setChapter(label);
    setTocOpen(false);
    await renditionRef.current?.display(href);
  };

  return (
    <div className={`reader reader-${readerTheme} mode-${readingMode}`}>
      <header className="reader-toolbar">
        <div className="reader-toolbar-side">
          <button className="toolbar-button" onClick={onBack}><ArrowLeft size={18} />返回书库</button>
          <button className={`toolbar-button icon-only ${tocOpen ? "selected" : ""}`} aria-label="打开章节目录" onClick={() => { setTocOpen((value) => !value); setSettingsOpen(false); }}><Menu size={19} /></button>
        </div>
        <div className="reader-title"><strong>{book.title}</strong><span>{chapter}</span></div>
        <div className="reader-toolbar-side toolbar-right">
          <button className={`toolbar-button icon-only ${settingsOpen ? "selected" : ""}`} aria-label="阅读设置" onClick={() => { setSettingsOpen((value) => !value); setTocOpen(false); }}><SlidersHorizontal size={19} /></button>
        </div>
      </header>

      {tocOpen && (
        <aside className="reader-panel toc-panel">
          <div className="panel-heading"><div><span>目录</span><small>{book.title}</small></div><button className="icon-button" aria-label="关闭目录" onClick={() => setTocOpen(false)}><X size={18} /></button></div>
          <nav>{flattenToc(toc).map((item) => <button key={`${item.id}-${item.href}`} style={{ paddingLeft: `${11 + item.depth * 14}px` }} onClick={() => void goTo(item.href, item.label)}><span>{item.label}</span></button>)}</nav>
        </aside>
      )}

      {settingsOpen && (
        <aside className="reader-panel settings-panel">
          <div className="panel-heading"><div><span>阅读设置</span><small>自动记住阅读样式</small></div><button className="icon-button" aria-label="关闭设置" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
          <div className="setting-group"><label>阅读方式</label><div className="segmented"><button className={readingMode === "paged" ? "active" : ""} onClick={() => setReadingMode("paged")}>分页</button><button className={readingMode === "scroll" ? "active" : ""} onClick={() => setReadingMode("scroll")}>滚动</button></div></div>
          <div className="setting-group"><label>字号 <span>{fontSize}px</span></label><input type="range" min="15" max="26" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></div>
          <div className="setting-group"><label>阅读主题</label><div className="theme-options"><button className={readerTheme === "light" ? "active light-swatch" : "light-swatch"} onClick={() => setReaderTheme("light")}><Sun size={16} />明亮</button><button className={readerTheme === "paper" ? "active paper-swatch" : "paper-swatch"} onClick={() => setReaderTheme("paper")}><BookOpen size={16} />纸张</button><button className={readerTheme === "dark" ? "active dark-swatch" : "dark-swatch"} onClick={() => setReaderTheme("dark")}><Moon size={16} />夜间</button></div></div>
        </aside>
      )}

      <main className="reading-stage">
        {readingMode === "paged" && <button className="page-zone page-zone-left" aria-label="上一页" onClick={() => void renditionRef.current?.prev()}><ChevronLeft size={25} /></button>}
        <div className="reading-paper epub-paper" ref={viewerRef} />
        {readingMode === "paged" && <button className="page-zone page-zone-right" aria-label="下一页" onClick={() => void renditionRef.current?.next()}><ChevronRight size={25} /></button>}
        {loading && <div className="reader-loading"><span className="loading-spinner" />正在载入 EPUB…</div>}
        {error && <div className="reader-error"><strong>无法打开这本书</strong><span>{error}</span><button onClick={onBack}>返回书库</button></div>}
      </main>

      <footer className="reader-footer"><span>{chapter}</span><div className="reader-progress"><span style={{ width: `${percentage * 100}%` }} /></div><span>{Math.round(percentage * 100)}%</span></footer>
    </div>
  );
}

function registerBaseTheme(rendition: Rendition) {
  const base = {
    body: {
      "font-family": '"Noto Serif SC", "Songti SC", SimSun, serif !important',
      "line-height": "1.95 !important",
      "padding": "32px 7% !important",
    },
    p: { "text-align": "justify", "text-indent": "2em" },
    a: { color: "var(--bookreader-link-color) !important" },
    img: { "max-width": "100% !important", height: "auto !important" },
  };
  rendition.themes.default(base);
}

function applyReaderTheme(rendition: Rendition, theme: ReaderTheme, viewer: HTMLDivElement | null) {
  const palette = theme === "dark"
    ? { background: "#282a2d", text: "#d8d5cf", link: "#aebed0" }
    : theme === "paper"
      ? { background: "#f4eedf", text: "#39342d", link: "#536b82" }
      : { background: "#ffffff", text: "#292b2f", link: "#466580" };

  rendition.themes.override("background", palette.background, true);
  rendition.themes.override("background-color", palette.background, true);
  rendition.themes.override("color", palette.text, true);
  rendition.themes.override("--bookreader-link-color", palette.link, true);

  if (viewer) viewer.style.backgroundColor = palette.background;
  const renderedContents = rendition.getContents() as unknown as Array<{ document?: Document }> | { document?: Document };
  const contents = Array.isArray(renderedContents) ? renderedContents : [renderedContents];
  for (const content of contents) {
    const document = (content as unknown as { document?: Document }).document;
    if (!document) continue;
    document.documentElement.style.setProperty("background", palette.background, "important");
    document.documentElement.style.setProperty("color", palette.text, "important");
    document.body?.style.setProperty("background", palette.background, "important");
    document.body?.style.setProperty("background-color", palette.background, "important");
    document.body?.style.setProperty("color", palette.text, "important");
  }
}
