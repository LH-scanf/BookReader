import {
  ArrowLeft, ArrowUpLeft, BookOpen, ChevronLeft, ChevronRight, Highlighter,
  Menu, MessageSquarePlus, Moon, NotebookPen, Search, SlidersHorizontal,
  Sun, X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ePub, { type Book, type NavItem, type Rendition } from "epubjs";
import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktopApp, loadAnnotations, persistProgress, readBookBytes, saveAnnotation } from "./library-api";
import type {
  AnnotationInput, AnnotationRecord, BookRecord, ReaderTheme, ReadingMode,
} from "./types";

type ReaderProps = {
  book: BookRecord;
  deviceId: string | null;
  initialPreviewCfi?: string | null;
  onBack: () => void;
  onOpenNotes: () => void;
  onProgress: (bookId: string, percentage: number, cfi: string | null, chapterHref: string | null) => void;
};
type LocationEvent = { start: { cfi: string; href: string; percentage?: number } };
type EpubContents = { document: Document; window: Window };
type SelectionDraft = Pick<AnnotationInput, "quote" | "chapterTitle" | "chapterHref" | "cfiRange"> & { x: number; y: number };
type ReflectionDraft = Pick<AnnotationInput, "id" | "quote" | "reflection" | "chapterTitle" | "chapterHref" | "cfiRange">;
type SearchResult = { id: string; cfi: string; chapterTitle: string; excerpt: string };
type FootnotePopup = { title: string; text: string; x: number; y: number };

function flattenToc(items: NavItem[], depth = 0): Array<NavItem & { depth: number }> {
  return items.flatMap((item) => [{ ...item, depth }, ...flattenToc(item.subitems ?? [], depth + 1)]);
}

function isEditing(target: EventTarget | null) {
  return Boolean((target as HTMLElement | null)?.closest("input, textarea, [contenteditable='true']"));
}

export default function EpubReader({ book, deviceId, initialPreviewCfi = null, onBack, onOpenNotes, onProgress }: ReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const epubBookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const displayedCfiRef = useRef<string | null>(book.cfi);
  const observedProgressAtRef = useRef(Date.parse(book.progressUpdatedAt ?? "") || 0);
  const localNavigationAtRef = useRef(0);
  const lastProgressRef = useRef<{ cfi: string; href: string; percentage: number } | null>(
    book.cfi ? { cfi: book.cfi, href: book.chapterHref ?? "", percentage: book.progress } : null,
  );
  const onProgressRef = useRef(onProgress);
  const onOpenNotesRef = useRef(onOpenNotes);
  const initialPreviewRef = useRef(initialPreviewCfi);
  const initialReturnCfiRef = useRef(book.cfi);
  const initialPreviewConsumedRef = useRef(false);
  const previewingRef = useRef(false);
  const returnCfiRef = useRef<string | null>(null);
  const annotationsRef = useRef<AnnotationRecord[]>([]);
  const appliedHighlightCfisRef = useRef<string[]>([]);
  const chapterRef = useRef("正在载入");
  const chapterHrefRef = useRef(book.chapterHref ?? "");

  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [readingMode, setReadingMode] = useState<ReadingMode>(() => localStorage.getItem("reader-mode") === "scroll" ? "scroll" : "paged");
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>(() => {
    const value = localStorage.getItem("reader-theme");
    return value === "light" || value === "dark" ? value : "paper";
  });
  const themeRef = useRef<ReaderTheme>(readerTheme);
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem("reader-font-size")) || 18);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [chapter, setChapter] = useState("正在载入");
  const [percentage, setPercentage] = useState(book.progress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [reflectionDraft, setReflectionDraft] = useState<ReflectionDraft | null>(null);
  const [footnote, setFootnote] = useState<FootnotePopup | null>(null);
  const [returnAvailable, setReturnAvailable] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [readerMessage, setReaderMessage] = useState<string | null>(null);

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onOpenNotesRef.current = onOpenNotes; }, [onOpenNotes]);

  const refreshNotes = useCallback(async () => {
    const records = await loadAnnotations(book.id);
    annotationsRef.current = records;
    setAnnotations(records);
  }, [book.id]);

  useEffect(() => { void refreshNotes().catch((reason) => setReaderMessage(String(reason))); }, [refreshNotes]);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let timer: number | null = null;
    let unlisten: (() => void) | undefined;
    void listen("library-changed", () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => void refreshNotes().catch(() => undefined), 450);
    }).then((cleanup) => { unlisten = cleanup; });
    return () => { if (timer) clearTimeout(timer); unlisten?.(); };
  }, [refreshNotes]);

  const flushProgress = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const last = lastProgressRef.current;
    if (last) await persistProgress({ bookId: book.id, cfi: last.cfi, chapterHref: last.href, percentage: last.percentage });
  }, [book.id]);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let allowClose = false;
    let cleanup: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      if (allowClose) return;
      event.preventDefault();
      await flushProgress().catch(() => undefined);
      allowClose = true;
      await getCurrentWindow().destroy();
    }).then((value) => { cleanup = value; });
    return () => cleanup?.();
  }, [flushProgress]);

  const openNotesWorkspace = useCallback(async () => {
    await flushProgress().catch(() => undefined);
    onOpenNotesRef.current();
  }, [flushProgress]);

  const closePanels = useCallback(() => {
    setTocOpen(false); setSettingsOpen(false); setSearchOpen(false);
    setFootnote(null); setSelectionDraft(null);
  }, []);

  const turnPage = useCallback((direction: "prev" | "next") => {
    localNavigationAtRef.current = Date.now();
    const rendition = renditionRef.current;
    if (!rendition) return;
    void rendition[direction]().catch((reason: unknown) => setReaderMessage(String(reason)));
  }, []);

  const handleKey = useCallback((event: KeyboardEvent) => {
    if (isEditing(event.target)) return;
    const rendition = renditionRef.current;
    if (!rendition) return;
    if (event.key === "Escape") { closePanels(); setReflectionDraft(null); return; }
    if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "f") {
      event.preventDefault(); closePanels(); setSearchOpen(true); return;
    }
    if (!event.ctrlKey && !event.altKey && event.key.toLowerCase() === "t") {
      event.preventDefault(); setTocOpen((value) => !value); setSettingsOpen(false); setSearchOpen(false); return;
    }
    if (!event.ctrlKey && !event.altKey && event.key.toLowerCase() === "n") {
      event.preventDefault(); void openNotesWorkspace(); return;
    }
    if (readingMode === "paged") {
      if (event.key === "ArrowLeft" || event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
        event.preventDefault(); turnPage("prev");
      } else if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault(); turnPage("next");
      }
    } else {
      const document = (event.target as Node | null)?.ownerDocument;
      const documentScroller = document?.scrollingElement as HTMLElement | null;
      const viewer = viewerRef.current;
      const frameElement = document?.defaultView?.frameElement as HTMLElement | null;
      const epubScroller = (frameElement?.closest(".epub-container")
        ?? viewer?.querySelector(".epub-container")) as HTMLElement | null;
      const activeScroller = epubScroller && epubScroller.scrollHeight > epubScroller.clientHeight
        ? epubScroller
        : documentScroller && documentScroller.scrollHeight > documentScroller.clientHeight
          ? documentScroller
          : viewer;
      const viewport = activeScroller?.clientHeight || window.innerHeight;
      const scrollBy = (top: number) => {
        localNavigationAtRef.current = Date.now();
        activeScroller?.scrollBy({ top, behavior: "smooth" });
      };
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); turnPage(event.key === "ArrowLeft" ? "prev" : "next");
      } else if (event.key === "ArrowUp") {
        event.preventDefault(); scrollBy(-80);
      } else if (event.key === "ArrowDown") {
        event.preventDefault(); scrollBy(80);
      } else if (event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
        event.preventDefault(); scrollBy(-viewport * 0.86);
      } else if (event.key === "PageDown" || event.key === " ") {
        event.preventDefault(); scrollBy(viewport * 0.86);
      } else if (event.key === "Home") {
        localNavigationAtRef.current = Date.now();
        event.preventDefault(); activeScroller?.scrollTo({ top: 0, behavior: "smooth" });
      } else if (event.key === "End") {
        localNavigationAtRef.current = Date.now();
        event.preventDefault(); activeScroller?.scrollTo({ top: activeScroller.scrollHeight, behavior: "smooth" });
      }
    }
  }, [closePanels, openNotesWorkspace, readingMode, turnPage]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const followInternalLink = useCallback(async (event: MouseEvent, contents: EpubContents) => {
    const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
    const href = anchor?.getAttribute("href");
    if (!anchor || !href?.includes("#") || href.startsWith("http")) return;
    event.preventDefault(); event.stopPropagation();
    const [pathPart, fragment = ""] = href.split("#");
    const id = decodeURIComponent(fragment);
    let target: Element | null = pathPart ? null : contents.document.getElementById(id);
    if (!target && pathPart && epubBookRef.current) {
      try {
        const document = await (epubBookRef.current as unknown as { load: (path: string) => Promise<Document> }).load(pathPart);
        target = document.getElementById(id);
      } catch { /* use navigation fallback */ }
    }
    const text = target?.textContent?.replace(/\s+/g, " ").trim();
    if (text) {
      const rect = anchor.getBoundingClientRect();
      const frame = (contents.window.frameElement as HTMLElement | null)?.getBoundingClientRect();
      setFootnote({ title: anchor.textContent?.trim() || "脚注", text, x: (frame?.left ?? 0) + rect.left + rect.width / 2, y: (frame?.top ?? 0) + rect.bottom + 8 });
    } else if (renditionRef.current) {
      returnCfiRef.current ??= displayedCfiRef.current;
      previewingRef.current = true;
      setReturnAvailable(Boolean(returnCfiRef.current));
      await renditionRef.current.display(href);
    }
  }, []);

  const focusCfi = useCallback(async (cfi: string) => {
    const epubBook = epubBookRef.current as unknown as { getRange?: (target: string) => Promise<Range> } | null;
    if (!epubBook?.getRange) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      const range = await epubBook.getRange(cfi);
      const element = (range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement) as HTMLElement | null;
      if (!element) return;
      if (readingMode === "scroll") element.scrollIntoView({ block: "center", inline: "nearest" });
      element.classList.add("bookreader-note-target");
      window.setTimeout(() => element.classList.remove("bookreader-note-target"), 1800);
    } catch { /* malformed external CFI */ }
  }, [readingMode]);

  useEffect(() => {
    let cancelled = false;
    let removeViewerWheel: (() => void) | undefined;
    const viewer = viewerRef.current;
    if (!viewer) return;
    setLoading(true); setError(null); viewer.replaceChildren();
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
        if (cancelled) return;
        const rendition = epubBook.renderTo(viewer, {
          width: "100%", height: "100%",
          flow: readingMode === "paged" ? "paginated" : "scrolled-doc",
          overflow: readingMode === "paged" ? "hidden" : "scroll",
          manager: "default", spread: "none", infinite: false,
        });
        renditionRef.current = rendition;
        registerBaseTheme(rendition, readingMode);
        applyReaderTheme(rendition, themeRef.current, viewer);
        rendition.themes.fontSize(`${fontSize}px`);

        let wheelLocked = false;
        const onWheel = (event: WheelEvent) => {
          if (event.deltaX || event.deltaY) localNavigationAtRef.current = Date.now();
          if (readingMode !== "paged" || Math.abs(event.deltaY) < 18) return;
          event.preventDefault();
          if (wheelLocked) return;
          wheelLocked = true;
          turnPage(event.deltaY > 0 ? "next" : "prev");
          window.setTimeout(() => { wheelLocked = false; }, 320);
        };

        rendition.on("rendered", (_section: unknown, contents: EpubContents) => {
          applyReaderTheme(rendition, themeRef.current, viewer);
          applyHighlights(rendition, annotationsRef.current, themeRef.current);
          appliedHighlightCfisRef.current = annotationsRef.current.map((record) => record.cfiRange);
          if (contents?.document && contents.document.documentElement.dataset.bookreaderBound !== "true") {
            contents.document.documentElement.dataset.bookreaderBound = "true";
            contents.document.addEventListener("keydown", handleKey);
            contents.document.addEventListener("click", (event) => void followInternalLink(event, contents));
            contents.document.addEventListener("wheel", onWheel, { passive: false });
          }
        });
        rendition.on("selected", (cfiRange: string, contents: EpubContents) => {
          const selection = contents.window.getSelection();
          const quote = selection?.toString().replace(/\s+/g, " ").trim();
          if (!quote || !selection?.rangeCount) return;
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          const frame = (contents.window.frameElement as HTMLElement | null)?.getBoundingClientRect();
          setSelectionDraft({ quote, cfiRange, chapterTitle: chapterRef.current, chapterHref: chapterHrefRef.current, x: (frame?.left ?? 0) + rect.left + rect.width / 2, y: (frame?.top ?? 0) + rect.bottom + 8 });
        });
        rendition.on("relocated", (location: LocationEvent) => {
          const { cfi, href } = location.start;
          displayedCfiRef.current = cfi;
          const calculated = location.start.percentage ?? epubBook.locations.percentageFromCfi(cfi) ?? 0;
          const next = Math.min(1, Math.max(0, calculated));
          setPercentage(next);
          const item = flattenToc(navigation.toc ?? []).find((entry) => href.includes(entry.href.split("#")[0]));
          const label = item?.label?.trim() || href || "正文";
          chapterRef.current = label; chapterHrefRef.current = href; setChapter(label);
          if (previewingRef.current) return;
          lastProgressRef.current = { cfi, href, percentage: next };
          onProgressRef.current(book.id, next, cfi, href);
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = window.setTimeout(() => void persistProgress({ bookId: book.id, cfi, chapterHref: href, percentage: next }), 700);
        });
        viewer.addEventListener("wheel", onWheel, { passive: false });
        removeViewerWheel = () => viewer.removeEventListener("wheel", onWheel);
        const initialTarget = initialPreviewConsumedRef.current ? null : initialPreviewRef.current;
        initialPreviewConsumedRef.current = true;
        if (initialTarget) {
          returnCfiRef.current = initialReturnCfiRef.current;
          previewingRef.current = true;
          setReturnAvailable(Boolean(initialReturnCfiRef.current));
        }
        await rendition.display(initialTarget ?? displayedCfiRef.current ?? undefined);
        if (initialTarget) await focusCfi(initialTarget);
        applyHighlights(rendition, annotationsRef.current, themeRef.current);
        appliedHighlightCfisRef.current = annotationsRef.current.map((record) => record.cfiRange);
        if (!cancelled) setLoading(false);
      } catch (reason) {
        if (!cancelled) { setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      removeViewerWheel?.();
      void flushProgress().catch(() => undefined);
      renditionRef.current?.destroy(); epubBookRef.current?.destroy();
      renditionRef.current = null; epubBookRef.current = null;
    };
  }, [book.id, readingMode, flushProgress, focusCfi, followInternalLink, handleKey, turnPage]);

  useEffect(() => {
    annotationsRef.current = annotations;
    if (renditionRef.current) {
      const manager = renditionRef.current.annotations as unknown as { remove: (cfi: string, type: string) => void };
      for (const cfi of appliedHighlightCfisRef.current) {
        try { manager.remove(cfi, "highlight"); } catch { /* already removed */ }
      }
      applyHighlights(renditionRef.current, annotations, readerTheme);
      appliedHighlightCfisRef.current = annotations.map((record) => record.cfiRange);
    }
  }, [annotations, readerTheme]);

  useEffect(() => {
    const updatedAt = Date.parse(book.progressUpdatedAt ?? "") || 0;
    if (updatedAt <= observedProgressAtRef.current) return;
    observedProgressAtRef.current = updatedAt;
    // Filesystem refreshes also echo our own delayed writes. A changed CFI alone
    // is never a navigation command: only a newer, identified remote device is.
    if (!deviceId || !book.progressDeviceId || book.progressDeviceId === deviceId
      || updatedAt <= localNavigationAtRef.current || previewingRef.current
      || !book.cfi || book.cfi === displayedCfiRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const target = book.cfi;
    if (!renditionRef.current) {
      displayedCfiRef.current = target;
      return;
    }
    void renditionRef.current.display(target).catch((reason: unknown) => setReaderMessage(String(reason)));
  }, [book.cfi, book.progressUpdatedAt, book.progressDeviceId, deviceId]);

  useEffect(() => {
    localStorage.setItem("reader-theme", readerTheme); themeRef.current = readerTheme;
    if (renditionRef.current) applyReaderTheme(renditionRef.current, readerTheme, viewerRef.current);
  }, [readerTheme]);
  useEffect(() => { localStorage.setItem("reader-font-size", String(fontSize)); renditionRef.current?.themes.fontSize(`${fontSize}px`); }, [fontSize]);
  useEffect(() => { localStorage.setItem("reader-mode", readingMode); }, [readingMode]);

  const goTo = async (href: string, label: string) => {
    localNavigationAtRef.current = Date.now();
    previewingRef.current = false; returnCfiRef.current = null; setReturnAvailable(false);
    setChapter(label); setTocOpen(false); await renditionRef.current?.display(href);
  };
  const beginPreview = async (cfi: string) => {
    if (!renditionRef.current) return;
    returnCfiRef.current ??= lastProgressRef.current?.cfi ?? displayedCfiRef.current;
    previewingRef.current = true; setReturnAvailable(Boolean(returnCfiRef.current));
    await renditionRef.current.display(cfi);
    await focusCfi(cfi);
  };
  const returnToReading = async () => {
    if (!returnCfiRef.current || !renditionRef.current) return;
    await renditionRef.current.display(returnCfiRef.current);
    previewingRef.current = false; returnCfiRef.current = null; setReturnAvailable(false);
  };

  const createHighlight = async (draft: SelectionDraft, reflection = "") => {
    try {
      const record = await saveAnnotation({ bookId: book.id, quote: draft.quote, reflection, chapterTitle: draft.chapterTitle, chapterHref: draft.chapterHref, cfiRange: draft.cfiRange });
      setAnnotations((current) => [...current.filter((item) => item.id !== record.id), record]);
      setSelectionDraft(null);
      setReaderMessage(reflection ? "高亮和感悟已保存" : "已高亮，可在整书笔记中补充感悟");
    } catch (reason) { setReaderMessage(String(reason)); }
  };
  const saveReflection = async () => {
    if (!reflectionDraft) return;
    try {
      const record = await saveAnnotation({ ...reflectionDraft, bookId: book.id });
      setAnnotations((current) => [...current.filter((item) => item.id !== record.id), record].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      setReflectionDraft(null); setSelectionDraft(null); setReaderMessage("感悟已保存到整书笔记");
    } catch (reason) { setReaderMessage(String(reason)); }
  };
  const runSearch = async () => {
    const query = searchQuery.trim();
    const epubBook = epubBookRef.current;
    if (!query || !epubBook) return;
    setSearching(true); setSearchResults([]);
    try {
      const results: SearchResult[] = [];
      type SearchSection = { href: string; load: (loader: unknown) => Promise<void>; unload: () => void; document: Document; cfiFromRange: (range: Range) => string };
      const typedBook = epubBook as unknown as { spine: { spineItems: SearchSection[] }; load: (path: string) => Promise<unknown> };
      const loader = typedBook.load.bind(epubBook);
      for (const section of typedBook.spine.spineItems) {
        if (results.length >= 100) break;
        try {
          await section.load(loader);
          const document = section.document;
          if (!document?.body) continue;
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode() as Text | null;
          while (node && results.length < 100) {
            const lower = node.data.toLocaleLowerCase();
            let offset = lower.indexOf(query.toLocaleLowerCase());
            while (offset >= 0 && results.length < 100) {
              const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + query.length);
              const start = Math.max(0, offset - 36); const end = Math.min(node.data.length, offset + query.length + 54);
              results.push({ id: `${section.href}-${offset}-${results.length}`, cfi: section.cfiFromRange(range), chapterTitle: section.href, excerpt: `${start ? "…" : ""}${node.data.slice(start, end).trim()}${end < node.data.length ? "…" : ""}` });
              offset = lower.indexOf(query.toLocaleLowerCase(), offset + Math.max(1, query.length));
            }
            node = walker.nextNode() as Text | null;
          }
        } finally { section.unload(); }
      }
      setSearchResults(results);
    } catch (reason) { setReaderMessage(`搜索失败：${String(reason)}`); }
    finally { setSearching(false); }
  };

  const leaveReader = async () => { await flushProgress().catch(() => undefined); onBack(); };
  const closeOtherPanels = () => { setTocOpen(false); setSettingsOpen(false); setSearchOpen(false); };

  return (
    <div className={`reader reader-${readerTheme} mode-${readingMode}`} onClick={() => setFootnote(null)}>
      <header className="reader-toolbar">
        <div className="reader-toolbar-side"><button className="toolbar-button" onClick={() => void leaveReader()}><ArrowLeft size={18} />返回书库</button><button className={`toolbar-button icon-only ${tocOpen ? "selected" : ""}`} aria-label="打开章节目录" onClick={() => { const next = !tocOpen; closeOtherPanels(); setTocOpen(next); }}><Menu size={19} /></button></div>
        <div className="reader-title"><strong title={book.title}>{book.title}</strong><span>{chapter}</span></div>
        <div className="reader-toolbar-side toolbar-right"><button className={`toolbar-button icon-only ${searchOpen ? "selected" : ""}`} aria-label="书内搜索" title="书内搜索 Ctrl+F" onClick={() => { const next = !searchOpen; closeOtherPanels(); setSearchOpen(next); }}><Search size={18} /></button><button className="toolbar-button icon-only" aria-label="打开整书笔记页面" title="整书笔记 N" onClick={() => void openNotesWorkspace()}><NotebookPen size={18} /></button><button className={`toolbar-button icon-only ${settingsOpen ? "selected" : ""}`} aria-label="阅读设置" onClick={() => { const next = !settingsOpen; closeOtherPanels(); setSettingsOpen(next); }}><SlidersHorizontal size={19} /></button></div>
      </header>

      {returnAvailable && <button className="return-reading-button" onClick={() => void returnToReading()}><ArrowUpLeft size={16} />返回刚才的阅读位置</button>}
      {readerMessage && <div className="reader-message" role="status"><span>{readerMessage}</span><button aria-label="关闭提示" onClick={() => setReaderMessage(null)}><X size={14} /></button></div>}

      {tocOpen && <aside className="reader-panel toc-panel"><PanelHeading title="目录" subtitle={book.title} onClose={() => setTocOpen(false)} /><nav>{flattenToc(toc).map((item) => <button key={`${item.id}-${item.href}`} style={{ paddingLeft: `${11 + item.depth * 14}px` }} onClick={() => void goTo(item.href, item.label)}><span>{item.label}</span></button>)}</nav></aside>}

      {searchOpen && <aside className="reader-panel search-panel"><PanelHeading title="书内搜索" subtitle="跳转结果不会覆盖阅读进度" onClose={() => setSearchOpen(false)} /><form className="reader-search-form" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="输入关键词" /><button disabled={searching || !searchQuery.trim()}>{searching ? "搜索中" : "搜索"}</button></form><div className="search-results">{!searching && searchQuery && <small>找到 {searchResults.length} 处结果</small>}{searchResults.map((result) => <button key={result.id} onClick={() => void beginPreview(result.cfi)}><span>{result.excerpt}</span><small>{result.chapterTitle}</small></button>)}</div></aside>}

      {settingsOpen && <aside className="reader-panel settings-panel"><PanelHeading title="阅读设置" subtitle="自动记住阅读样式" onClose={() => setSettingsOpen(false)} /><div className="setting-group"><label>阅读方式</label><div className="segmented"><button className={readingMode === "paged" ? "active" : ""} onClick={() => setReadingMode("paged")}>分页</button><button className={readingMode === "scroll" ? "active" : ""} onClick={() => setReadingMode("scroll")}>滚动</button></div></div><div className="setting-group"><label>字号 <span>{fontSize}px</span></label><input type="range" min="15" max="26" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></div><div className="setting-group"><label>阅读主题</label><div className="theme-options"><button className={readerTheme === "light" ? "active light-swatch" : "light-swatch"} onClick={() => setReaderTheme("light")}><Sun size={16} />明亮</button><button className={readerTheme === "paper" ? "active paper-swatch" : "paper-swatch"} onClick={() => setReaderTheme("paper")}><BookOpen size={16} />纸张</button><button className={readerTheme === "dark" ? "active dark-swatch" : "dark-swatch"} onClick={() => setReaderTheme("dark")}><Moon size={16} />夜间</button></div></div><div className="shortcut-help"><strong>快捷键</strong><span>分页：← → / PageUp PageDown 翻页</span><span>滚动：↑ ↓ / PageUp PageDown / 空格</span><span>Ctrl+F 搜索 · T 目录 · N 整书笔记 · Esc 关闭</span></div></aside>}

      <main className="reading-stage">{readingMode === "paged" && <button className="page-zone page-zone-left" aria-label="上一页" onClick={() => turnPage("prev")}><ChevronLeft size={25} /></button>}<div className="reading-paper epub-paper" ref={viewerRef} />{readingMode === "paged" && <button className="page-zone page-zone-right" aria-label="下一页" onClick={() => turnPage("next")}><ChevronRight size={25} /></button>}{loading && <div className="reader-loading"><span className="loading-spinner" />正在载入 EPUB…</div>}{error && <div className="reader-error"><strong>无法打开这本书</strong><span>{error}</span><button onClick={onBack}>返回书库</button></div>}</main>

      {selectionDraft && <div className="selection-toolbar" style={{ left: selectionDraft.x, top: selectionDraft.y }} onClick={(event) => event.stopPropagation()}><button onClick={() => void createHighlight(selectionDraft)}><Highlighter size={15} />高亮</button><button onClick={() => setReflectionDraft({ quote: selectionDraft.quote, reflection: "", chapterTitle: selectionDraft.chapterTitle, chapterHref: selectionDraft.chapterHref, cfiRange: selectionDraft.cfiRange })}><MessageSquarePlus size={15} />记录感悟</button><button aria-label="取消" onClick={() => setSelectionDraft(null)}><X size={14} /></button></div>}
      {footnote && <div className="footnote-popover" style={{ left: footnote.x, top: footnote.y }} onClick={(event) => event.stopPropagation()}><div><strong>{footnote.title}</strong><button aria-label="关闭脚注" onClick={() => setFootnote(null)}><X size={14} /></button></div><p>{footnote.text}</p></div>}
      {reflectionDraft && <div className="reader-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReflectionDraft(null); }}><div className="reflection-dialog"><div><span>原文</span><blockquote>{reflectionDraft.quote}</blockquote></div><label>我的感悟<textarea autoFocus value={reflectionDraft.reflection} onChange={(event) => setReflectionDraft((current) => current ? { ...current, reflection: event.target.value } : null)} placeholder="写下此刻的理解……" /></label><div><button onClick={() => setReflectionDraft(null)}>取消</button><button className="save-reflection" onClick={() => void saveReflection()}>保存到整书笔记</button></div></div></div>}
      <footer className="reader-footer"><span>{chapter}</span><div className="reader-progress"><span style={{ width: `${percentage * 100}%` }} /></div><span>{Math.round(percentage * 100)}%</span></footer>
    </div>
  );
}

function PanelHeading({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return <div className="panel-heading"><div><span>{title}</span><small>{subtitle}</small></div><button className="icon-button" aria-label={`关闭${title}`} onClick={onClose}><X size={18} /></button></div>;
}

function registerBaseTheme(rendition: Rendition, mode: ReadingMode) {
  rendition.themes.default({
    // Paginated chapters span multiple columns inside a wide iframe. Their
    // width, padding and overflow must remain under epub.js layout control.
    body: {
      "font-family": '"Noto Serif SC", "Songti SC", SimSun, serif !important',
      "line-height": "1.95 !important",
      "overflow-wrap": "anywhere",
      ...(mode === "scroll" ? { padding: "32px 7% !important" } : {}),
    },
    p: { "text-align": "justify", "text-indent": "2em" },
    a: { color: "var(--bookreader-link-color) !important" },
    img: { "max-width": "100% !important", height: "auto !important" },
    table: { "max-width": "100% !important" },
    pre: { "max-width": "100% !important", "white-space": "pre-wrap !important", "overflow-wrap": "anywhere" },
  });
}

function applyHighlights(rendition: Rendition, records: AnnotationRecord[], theme: ReaderTheme) {
  const manager = rendition.annotations as unknown as { remove: (cfi: string, type: string) => void; highlight: (cfi: string, data?: object, callback?: () => void, className?: string, styles?: object) => void };
  const highlight = theme === "dark"
    ? { fill: "#ffd76a", "fill-opacity": "0.18", "mix-blend-mode": "normal" }
    : theme === "paper"
      ? { fill: "#e5b93f", "fill-opacity": "0.22", "mix-blend-mode": "normal" }
      : { fill: "#f2c84b", "fill-opacity": "0.25", "mix-blend-mode": "normal" };
  for (const record of records) {
    try { manager.remove(record.cfiRange, "highlight"); } catch { /* not rendered */ }
    try { manager.highlight(record.cfiRange, { annotationId: record.id }, undefined, "bookreader-highlight", highlight); } catch { /* invalid external CFI */ }
  }
}

function applyReaderTheme(rendition: Rendition, theme: ReaderTheme, viewer: HTMLDivElement | null) {
  const palette = theme === "dark"
    ? { background: "#282a2d", text: "#d8d5cf", link: "#aebed0", scrollTrack: "#282a2d", scrollThumb: "#62666c", focus: "#e0b94f" }
    : theme === "paper"
      ? { background: "#f4eedf", text: "#39342d", link: "#536b82", scrollTrack: "#eee7d8", scrollThumb: "#aaa18f", focus: "#9b7420" }
      : { background: "#ffffff", text: "#292b2f", link: "#466580", scrollTrack: "#f2f2ef", scrollThumb: "#a4a7aa", focus: "#8b6b18" };
  rendition.themes.override("background", palette.background, true);
  rendition.themes.override("background-color", palette.background, true);
  rendition.themes.override("color", palette.text, true);
  rendition.themes.override("--bookreader-link-color", palette.link, true);
  if (viewer) viewer.style.backgroundColor = palette.background;
  const raw = rendition.getContents() as unknown as Array<{ document?: Document }> | { document?: Document };
  for (const content of Array.isArray(raw) ? raw : [raw]) {
    const document = content.document;
    if (!document) continue;
    document.documentElement.style.setProperty("background", palette.background, "important");
    document.documentElement.style.setProperty("color", palette.text, "important");
    document.body?.style.setProperty("background", palette.background, "important");
    document.body?.style.setProperty("background-color", palette.background, "important");
    document.body?.style.setProperty("color", palette.text, "important");
    let style = document.getElementById("bookreader-runtime-style") as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = "bookreader-runtime-style";
      document.head?.append(style);
    }
    const scrollLayout = rendition.settings.flow !== "paginated";
    style.textContent = `
      html, body { scrollbar-width: thin; scrollbar-color: ${palette.scrollThumb} ${palette.scrollTrack}; }
      ${scrollLayout ? `
        html, body { max-width: 100% !important; overflow: hidden !important; }
        body { box-sizing: border-box !important; }
      ` : ""}
      img, svg, video, table { max-width: 100% !important; height: auto; }
      pre { max-width: 100% !important; white-space: pre-wrap !important; overflow-wrap: anywhere; }
      ::-webkit-scrollbar { width: 9px; height: 9px; }
      ::-webkit-scrollbar-track { background: ${palette.scrollTrack}; }
      ::-webkit-scrollbar-thumb { border: 2px solid ${palette.scrollTrack}; border-radius: 999px; background: ${palette.scrollThumb}; }
      .bookreader-note-target { outline: 2px solid ${palette.focus}; outline-offset: 5px; border-radius: 2px; }
    `;
  }
}
