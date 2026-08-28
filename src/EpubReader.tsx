import {
  ArrowLeft, ArrowUpLeft, BookOpen, ChevronLeft, ChevronRight, Highlighter,
  Eye, EyeOff, Menu, MessageSquarePlus, Moon, NotebookPen, Search, SlidersHorizontal, Trash2,
  Sun, X,
} from "lucide-react";
import ePub, { type Book, type NavItem, type Rendition } from "epubjs";
import { installPreciseMapping } from "./reader/precise-mapping";
import { isIOSWebDevice, readerProgressLabel, resolveEpubRelativePath, swipeDirection } from "./reader/reader-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { isDesktopApp, subscribeLibraryChanges, subscribeBeforeClose, loadAnnotations, persistProgress, readBookBytes, removeAnnotation, saveAnnotation } from "./library-api";
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
type LocationEvent = { start: { cfi: string; href: string; percentage?: number; location?: number } };
type EpubContents = { document: Document; window: Window; cfiFromRange?: (range: Range) => string };
type EpubView = {
  contents?: EpubContents;
  iframe?: HTMLIFrameElement;
  _width?: number;
  layout?: { pageWidth?: number; height?: number };
  reframe?: (width: number, height: number) => void;
};
type SelectionDraft = Pick<AnnotationInput, "quote" | "chapterTitle" | "chapterHref" | "cfiRange"> & { x: number; y: number; annotationId?: string; reflection?: string };
type ReflectionDraft = Pick<AnnotationInput, "id" | "quote" | "reflection" | "chapterTitle" | "chapterHref" | "cfiRange">;
type SearchResult = { id: string; cfi: string; chapterTitle: string; excerpt: string };
type FootnotePopup = { title: string; text: string; x: number; y: number };
type IframeDiagnosticEvent = "touchstart" | "touchend" | "selectionchange" | "selected" | "selection-poll";
type PagingDiagnosticEvent = "content-start" | "content-end" | "rendition-start" | "rendition-end" | "recognized" | "next-requested" | "prev-requested" | "relocated";

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
  const pendingNavigationRef = useRef<Promise<void>>(Promise.resolve());
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
  const highlightReflowTimerRef = useRef<number | null>(null);
  const pagingDiagnosticEnabledRef = useRef(false);
  const iosWeb = !isDesktopApp() && isIOSWebDevice();
  // Production-only diagnostic switch. It is intentionally opt-in and does
  // not change the normal reader's safe sandbox setting.
  const iframeDiagnosticValue = new URLSearchParams(window.location.search).get("epubIframeDiagnostic");
  const iframeDiagnostic = iframeDiagnosticValue === "false" || iframeDiagnosticValue === "true";
  const allowScriptedContent = iframeDiagnosticValue === "true";

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
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [showPageNumbers, setShowPageNumbers] = useState(false);
  const [pagePosition, setPagePosition] = useState<{ current: number; total: number } | null>(null);
  const [iframeDiagnosticEvents, setIframeDiagnosticEvents] = useState<Partial<Record<IframeDiagnosticEvent, number>>>({});
  const [pagingDiagnosticEnabled, setPagingDiagnosticEnabled] = useState(false);
  const [pagingDiagnosticEvents, setPagingDiagnosticEvents] = useState<Partial<Record<PagingDiagnosticEvent, number>>>({});
  const [pagingLayout, setPagingLayout] = useState<{ pageWidth: number; contentWidth: number; frameWidth: number; before?: string; after?: string } | null>(null);
  const [pagingFrameMetrics, setPagingFrameMetrics] = useState<{ viewWidth: number; iframeWidth: number; rootWidth: number; bodyWidth: number; stageWidth: number; stageLeft: number; pageWidth: number; delta: number } | null>(null);

  const recordIframeDiagnostic = useCallback((event: IframeDiagnosticEvent) => {
    setIframeDiagnosticEvents((current) => ({ ...current, [event]: (current[event] ?? 0) + 1 }));
    setReaderMessage(`${event} 收到`);
  }, []);
  const recordPagingDiagnostic = useCallback((event: PagingDiagnosticEvent) => {
    if (!pagingDiagnosticEnabledRef.current) return;
    setPagingDiagnosticEvents((current) => ({ ...current, [event]: (current[event] ?? 0) + 1 }));
  }, []);
  useEffect(() => { pagingDiagnosticEnabledRef.current = pagingDiagnosticEnabled; }, [pagingDiagnosticEnabled]);

  const capturePagingScroll = useCallback((rendition: Rendition) => {
    const container = (rendition as unknown as { manager?: { container?: HTMLElement } }).manager?.container;
    if (!container) return "不可用";
    return `${Math.round(container.scrollLeft)}/${Math.round(container.scrollWidth)}/${Math.round(container.clientWidth)}`;
  }, []);

  const capturePagedFrameMetrics = useCallback((rendition: Rendition, suppliedView?: EpubView) => {
    if (!pagingDiagnosticEnabledRef.current) return null;
    const manager = (rendition as unknown as { manager?: { container?: HTMLElement; layout?: { pageWidth?: number; delta?: number }; views?: { last?: () => EpubView } } }).manager;
    const view = suppliedView ?? manager?.views?.last?.();
    const document = view?.contents?.document;
    const container = manager?.container;
    if (!view || !document || !container) return null;
    const metrics = {
      viewWidth: Math.round(view._width ?? 0),
      iframeWidth: Math.round(view.iframe?.getBoundingClientRect().width ?? 0),
      rootWidth: Math.round(document.documentElement.scrollWidth),
      bodyWidth: Math.round(document.body?.scrollWidth ?? 0),
      stageWidth: Math.round(container.scrollWidth),
      stageLeft: Math.round(container.scrollLeft),
      pageWidth: Math.round(manager?.layout?.pageWidth ?? 0),
      delta: Math.round(manager?.layout?.delta ?? 0),
    };
    setPagingFrameMetrics(metrics);
    setPagingLayout((current) => ({ pageWidth: metrics.pageWidth, contentWidth: metrics.rootWidth, frameWidth: metrics.viewWidth, before: current?.before, after: current?.after }));
    return `view ${metrics.viewWidth} · iframe ${metrics.iframeWidth} · root/body ${metrics.rootWidth}/${metrics.bodyWidth} · stage ${metrics.stageLeft}/${metrics.stageWidth} · page/delta ${metrics.pageWidth}/${metrics.delta}`;
  }, []);

  useEffect(() => { onProgressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { onOpenNotesRef.current = onOpenNotes; }, [onOpenNotes]);
  useEffect(() => {
    if (!iosWeb) return;
    document.documentElement.dataset.readerIos = "true";
    return () => { delete document.documentElement.dataset.readerIos; };
  }, [iosWeb]);

  useEffect(() => {
    if (!iosWeb) return;
    // iOS reserves the outer 24px for system back navigation. The reader has
    // its own explicit back button, so keep one same-document history entry
    // while it is open instead of revealing the earlier Microsoft login page.
    const marker = "bookreader-reader-history-guard";
    const guardedState = { ...(history.state ?? {}), [marker]: true };
    history.pushState(guardedState, "", location.href);
    const keepReaderOpen = () => history.pushState(guardedState, "", location.href);
    window.addEventListener("popstate", keepReaderOpen);
    return () => {
      window.removeEventListener("popstate", keepReaderOpen);
      if (history.state?.[marker]) history.back();
    };
  }, [iosWeb]);

  const refreshNotes = useCallback(async () => {
    const records = await loadAnnotations(book.id);
    annotationsRef.current = records;
    setAnnotations(records);
  }, [book.id]);

  useEffect(() => { void refreshNotes().catch((reason) => setReaderMessage(String(reason))); }, [refreshNotes]);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    let unlisten: (() => void) | undefined;
    void subscribeLibraryChanges(() => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => void refreshNotes().catch(() => undefined), 450);
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch((error) => setReaderMessage(String(error)));
    return () => { disposed = true; if (timer) clearTimeout(timer); unlisten?.(); };
  }, [refreshNotes]);

  const flushProgress = useCallback(async (refreshLocation = false) => {
    if (refreshLocation && !previewingRef.current && renditionRef.current) {
      await pendingNavigationRef.current;
      const location = await renditionRef.current?.currentLocation() as unknown as LocationEvent | undefined;
      if (location?.start?.cfi) {
        const { cfi, href, percentage } = location.start;
        lastProgressRef.current = { cfi, href, percentage: percentage ?? epubBookRef.current?.locations.percentageFromCfi(cfi) ?? 0 };
      }
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const last = lastProgressRef.current;
    if (last) await persistProgress({ bookId: book.id, cfi: last.cfi, chapterHref: last.href, percentage: last.percentage });
  }, [book.id]);

  useEffect(() => {
    let disposed = false; let cleanup: (() => void) | undefined;
    void subscribeBeforeClose(async () => {
      try { await flushProgress(isDesktopApp()); }
      catch (error) { setReaderMessage(`保存失败：${String(error)}`); throw error; }
    }).then((fn) => { if (disposed) fn(); else cleanup = fn; }).catch((error) => setReaderMessage(String(error)));
    return () => { disposed = true; cleanup?.(); };
  }, [flushProgress]);

  const openNotesWorkspace = useCallback(async () => {
    try { await flushProgress(true); onOpenNotesRef.current(); }
    catch (error) { setReaderMessage(`保存失败：${String(error)}，请重试后再离开`); }
  }, [flushProgress]);

  const closePanels = useCallback(() => {
    setTocOpen(false); setSettingsOpen(false); setSearchOpen(false);
    setFootnote(null); setSelectionDraft(null);
  }, []);

  const showSelectionToolbar = useCallback((contents: EpubContents, cfiRange?: string) => {
    const selection = contents.window.getSelection();
    const quote = selection?.toString().replace(/\s+/g, " ").trim();
    if (!quote || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const resolvedCfi = cfiRange ?? contents.cfiFromRange?.(range);
    if (!resolvedCfi) return;
    const rect = range.getBoundingClientRect();
    const frame = (contents.window.frameElement as HTMLElement | null)?.getBoundingClientRect();
    const existing = annotationsRef.current.find((record) => record.cfiRange === resolvedCfi);
    const rawX = (frame?.left ?? 0) + rect.left + rect.width / 2;
    const rawY = (frame?.top ?? 0) + rect.bottom + 8;
    setSelectionDraft({ quote, cfiRange: resolvedCfi, chapterTitle: chapterRef.current, chapterHref: chapterHrefRef.current,
      annotationId: existing?.id, reflection: existing?.reflection,
      x: Math.min(window.innerWidth - 120, Math.max(120, rawX)), y: Math.min(window.innerHeight - 54, Math.max(8, rawY)) });
  }, []);

  const turnPage = useCallback((direction: "prev" | "next") => {
    localNavigationAtRef.current = Date.now();
    const rendition = renditionRef.current;
    if (!rendition) return;
    const before = pagingDiagnosticEnabledRef.current ? capturePagingScroll(rendition) : undefined;
    if (before) setPagingLayout((current) => current ? { ...current, before, after: undefined } : { pageWidth: 0, contentWidth: 0, frameWidth: 0, before });
    // Deliberately no iOS transform/filter/animation here. Safari may
    // composite an iframe into a blank layer when an ancestor is 3D animated.
    pendingNavigationRef.current = rendition[direction]()
      .then(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
      .then(() => {
        if (!pagingDiagnosticEnabledRef.current) return;
        const after = capturePagingScroll(rendition);
        setPagingLayout((current) => current ? { ...current, after } : { pageWidth: 0, contentWidth: 0, frameWidth: 0, after });
        const frameMetrics = capturePagedFrameMetrics(rendition);
        setReaderMessage(`分页舞台 scrollLeft/scrollWidth/clientWidth：${before ?? "-"} → ${after}${frameMetrics ? `\n${frameMetrics}` : ""}`);
      })
      .catch((reason: unknown) => setReaderMessage(String(reason)));
  }, [capturePagedFrameMetrics, capturePagingScroll]);

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
    event.preventDefault(); event.stopImmediatePropagation();
    const [pathPart, fragment = ""] = href.split("#");
    const id = decodeURIComponent(fragment);
    let target: Element | null = pathPart ? null : contents.document.getElementById(id) ?? contents.document.getElementsByName(id).item(0);
    const internalPath = resolveEpubRelativePath(chapterHrefRef.current, pathPart);
    if (!target && pathPart && epubBookRef.current) {
      try {
        const document = await epubBookRef.current.load(internalPath) as Document;
        target = document.getElementById(id) ?? document.getElementsByName(id).item(0);
      } catch { /* use navigation fallback */ }
    }
    const text = target?.textContent?.replace(/\s+/g, " ").trim();
    if (text) {
      const rect = anchor.getBoundingClientRect();
      const frame = (contents.window.frameElement as HTMLElement | null)?.getBoundingClientRect();
      setFootnote({ title: anchor.textContent?.trim() || "脚注", text, x: (frame?.left ?? 0) + rect.left + rect.width / 2, y: (frame?.top ?? 0) + rect.bottom + 8 });
    } else if (iosWeb && (anchor.getAttribute("epub:type")?.split(/\s+/).includes("noteref") || anchor.getAttribute("role") === "doc-noteref")) {
      setReaderMessage("未能读取这条脚注，已留在当前页");
    } else if (renditionRef.current) {
      returnCfiRef.current ??= displayedCfiRef.current;
      previewingRef.current = true;
      setReturnAvailable(Boolean(returnCfiRef.current));
      await renditionRef.current.display(`${internalPath}#${fragment}`);
    }
  }, [iosWeb]);

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
    let selectionPoll: number | undefined;
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
          // epub.js owns the horizontal stage used for reflowable pagination.
          // Keeping it hidden prevents Safari from exposing that whole stage as
          // a draggable blank canvas; next/prev still change its scroll offset
          // programmatically one page at a time.
          overflow: "hidden",
          manager: "default", spread: "none", infinite: false, allowScriptedContent,
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

        // `rendered` receives an IframeView, not Contents. Keep it for visual
        // work only; event wiring belongs in the content hook below.
        rendition.on("rendered", (_section: unknown, view: EpubView) => {
          // Phase 2: observe epub.js's own expand/reframe result only. Do not
          // override the view size while determining why Safari shows blank pages.
          capturePagedFrameMetrics(rendition, view);
          installPreciseMapping(rendition);
          applyReaderTheme(rendition, themeRef.current, viewer);
          appliedHighlightCfisRef.current = refreshHighlights(rendition, annotationsRef.current, themeRef.current, appliedHighlightCfisRef.current);
        });

        rendition.hooks.content.register((contents: EpubContents) => {
          if (contents?.document && contents.document.documentElement.dataset.bookreaderBound !== "true") {
            contents.document.documentElement.dataset.bookreaderBound = "true";
            contents.document.addEventListener("keydown", handleKey);
            contents.document.addEventListener("click", (event) => void followInternalLink(event, contents), true);
            contents.document.addEventListener("wheel", onWheel, { passive: false });
            contents.document.addEventListener("touchstart", () => recordPagingDiagnostic("content-start"), { passive: true });
            contents.document.addEventListener("touchend", () => recordPagingDiagnostic("content-end"), { passive: true });
            let selectionTimer: number | null = null;
            const scheduleSelectionToolbar = () => {
              if (selectionTimer) window.clearTimeout(selectionTimer);
              selectionTimer = window.setTimeout(() => showSelectionToolbar(contents), 300);
            };
            contents.document.addEventListener("selectionchange", () => {
              if (iframeDiagnostic) { recordIframeDiagnostic("selectionchange"); return; }
              scheduleSelectionToolbar();
            });
          }
        });

        // epub.js forwards iframe touch events through Rendition. Keeping the
        // gesture state here avoids listeners being lost as IframeViews change.
        let touch: { x: number; y: number; at: number } | null = null;
        rendition.on("touchstart", (event: TouchEvent) => {
          recordPagingDiagnostic("rendition-start");
          if (iframeDiagnostic) { recordIframeDiagnostic("touchstart"); return; }
          localNavigationAtRef.current = Date.now();
          if (event.touches.length !== 1) { touch = null; return; }
          const point = event.touches[0];
          touch = { x: point.clientX, y: point.clientY, at: performance.now() };
        });
        rendition.on("touchend", (event: TouchEvent, contents: EpubContents) => {
          recordPagingDiagnostic("rendition-end");
          if (iframeDiagnostic) { recordIframeDiagnostic("touchend"); return; }
          const start = touch;
          touch = null;
          if (!start || readingMode !== "paged" || event.changedTouches.length !== 1) return;
          if (contents.window.getSelection()?.toString().trim()) return;
          // Leave the system's edge-back gesture to Safari.
          const width = contents.window.innerWidth || window.innerWidth;
          if (start.x < 24 || start.x > width - 24) return;
          const end = event.changedTouches[0];
          const direction = swipeDirection(start, { x: end.clientX, y: end.clientY }, performance.now() - start.at);
          if (direction) {
            recordPagingDiagnostic("recognized");
            recordPagingDiagnostic(direction === "next" ? "next-requested" : "prev-requested");
            turnPage(direction);
          }
        });
        rendition.on("touchcancel", () => { touch = null; });
        rendition.on("selected", (cfiRange: string, contents: EpubContents) => {
          if (iframeDiagnostic) { recordIframeDiagnostic("selected"); return; }
          showSelectionToolbar(contents, cfiRange);
        });
        // iOS fallback: inspect the real iframe Selection. In diagnostics it
        // records detection only; otherwise it opens the existing action bar.
        let lastPolledCfi: string | null = null;
        selectionPoll = window.setInterval(() => {
          const rawContents = rendition.getContents() as unknown as EpubContents[] | EpubContents;
          const contentsList = Array.isArray(rawContents) ? rawContents : [rawContents];
          let hasSelection = false;
          for (const contents of contentsList) {
            const selection = contents?.window?.getSelection();
            if (!selection || selection.isCollapsed || !selection.rangeCount) continue;
            hasSelection = true;
            const quote = selection.toString().replace(/\s+/g, " ").trim();
            const cfiRange = contents.cfiFromRange?.(selection.getRangeAt(0));
            if (!quote || !cfiRange || cfiRange === lastPolledCfi) continue;
            lastPolledCfi = cfiRange;
            if (iframeDiagnostic) recordIframeDiagnostic("selection-poll");
            else showSelectionToolbar(contents, cfiRange);
          }
          if (!hasSelection) lastPolledCfi = null;
        }, 250);
        rendition.on("relocated", (location: LocationEvent) => {
          recordPagingDiagnostic("relocated");
          const { cfi, href } = location.start;
          displayedCfiRef.current = cfi;
          const calculated = location.start.percentage ?? epubBook.locations.percentageFromCfi(cfi) ?? 0;
          const next = Math.min(1, Math.max(0, calculated));
          setPercentage(next);
          const total = epubBook.locations.length();
          const locationIndex = location.start.location ?? epubBook.locations.locationFromCfi(cfi);
          setPagePosition(total > 0 && Number.isFinite(locationIndex) ? { current: Math.min(total, Math.max(1, Number(locationIndex) + 1)), total } : null);
          const item = flattenToc(navigation.toc ?? []).find((entry) => href.includes(entry.href.split("#")[0]));
          const label = item?.label?.trim() || href || "正文";
          chapterRef.current = label; chapterHrefRef.current = href; setChapter(label);
          if (previewingRef.current) return;
          lastProgressRef.current = { cfi, href, percentage: next };
          onProgressRef.current(book.id, next, cfi, href);
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          const save = () => void persistProgress({ bookId: book.id, cfi, chapterHref: href, percentage: next }).catch((error) => setReaderMessage(`保存失败：${String(error)}`));
          if (isDesktopApp()) saveTimerRef.current = window.setTimeout(save, 700);
          else save();
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
      if (selectionPoll) window.clearInterval(selectionPoll);
      if (highlightReflowTimerRef.current) window.clearTimeout(highlightReflowTimerRef.current);
      void flushProgress().catch(() => undefined);
      renditionRef.current?.destroy(); epubBookRef.current?.destroy();
      renditionRef.current = null; epubBookRef.current = null;
    };
  }, [allowScriptedContent, book.id, iframeDiagnostic, readingMode, flushProgress, focusCfi, followInternalLink, handleKey, recordIframeDiagnostic, showSelectionToolbar, turnPage]);

  useEffect(() => {
    annotationsRef.current = annotations;
    if (renditionRef.current) {
      appliedHighlightCfisRef.current = refreshHighlights(renditionRef.current, annotations, readerTheme, appliedHighlightCfisRef.current);
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
  useEffect(() => {
    localStorage.setItem("reader-font-size", String(fontSize));
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.themes.fontSize(`${fontSize}px`);
    if (highlightReflowTimerRef.current) window.clearTimeout(highlightReflowTimerRef.current);
    // epub.js keeps annotation SVG coordinates from the previous layout. Re-display
    // the current CFI after the final range update, then rebuild every highlight.
    highlightReflowTimerRef.current = window.setTimeout(() => {
      const anchor = displayedCfiRef.current;
      pendingNavigationRef.current = rendition.display(anchor ?? undefined)
        .then(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        .then(() => {
          if (renditionRef.current !== rendition) return;
          appliedHighlightCfisRef.current = refreshHighlights(rendition, annotationsRef.current, themeRef.current, appliedHighlightCfisRef.current);
        })
        .catch((reason: unknown) => setReaderMessage(`字号重排失败：${String(reason)}`));
    }, 140);
    return () => { if (highlightReflowTimerRef.current) window.clearTimeout(highlightReflowTimerRef.current); };
  }, [fontSize]);
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
      const record = await saveAnnotation({ id: draft.annotationId, bookId: book.id, quote: draft.quote, reflection, chapterTitle: draft.chapterTitle, chapterHref: draft.chapterHref, cfiRange: draft.cfiRange });
      setAnnotations((current) => [...current.filter((item) => item.id !== record.id), record]);
      setSelectionDraft(null);
      clearReaderSelection(renditionRef.current);
      setReaderMessage(reflection ? "高亮和感悟已保存" : "已高亮，可在整书笔记中补充感悟");
    } catch (reason) { setReaderMessage(String(reason)); }
  };
  const saveReflection = async () => {
    if (!reflectionDraft) return;
    try {
      const record = await saveAnnotation({ ...reflectionDraft, bookId: book.id });
      setAnnotations((current) => [...current.filter((item) => item.id !== record.id), record].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      setReflectionDraft(null); setSelectionDraft(null); setReaderMessage("感悟已保存到整书笔记");
      clearReaderSelection(renditionRef.current);
    } catch (reason) { setReaderMessage(String(reason)); }
  };
  const deleteSelectionNote = async (draft: SelectionDraft) => {
    if (!draft.annotationId || !window.confirm("确定删除这条高亮和笔记吗？")) return;
    try {
      await removeAnnotation(book.id, draft.annotationId);
      setAnnotations((current) => current.filter((item) => item.id !== draft.annotationId));
      setSelectionDraft(null); clearReaderSelection(renditionRef.current);
      setReaderMessage("高亮和笔记已删除");
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

  const leaveReader = async () => {
    try { await flushProgress(true); onBack(); }
    catch (error) { setReaderMessage(`保存失败：${String(error)}，请重试后再离开`); }
  };
  const closeOtherPanels = () => { setTocOpen(false); setSettingsOpen(false); setSearchOpen(false); };

  return (
    <div className={`reader reader-${readerTheme} mode-${readingMode}${iosWeb ? " reader-ios" : ""}${toolbarHidden ? " reader-toolbar-hidden" : ""}`} onClick={() => setFootnote(null)}>
      <header className="reader-toolbar">
        <div className="reader-toolbar-side"><button className="toolbar-button" onClick={() => void leaveReader()} aria-label="返回书库"><ArrowLeft size={18} /><span className="back-label">返回书库</span></button><button className={`toolbar-button icon-only ${tocOpen ? "selected" : ""}`} aria-label="打开章节目录" onClick={() => { const next = !tocOpen; closeOtherPanels(); setTocOpen(next); }}><Menu size={19} /></button></div>
        <div className="reader-title"><strong title={book.title}>{book.title}</strong><span>{chapter}</span></div>
        <div className="reader-toolbar-side toolbar-right"><button className={`toolbar-button icon-only ${searchOpen ? "selected" : ""}`} aria-label="书内搜索" title="书内搜索 Ctrl+F" onClick={() => { const next = !searchOpen; closeOtherPanels(); setSearchOpen(next); }}><Search size={18} /></button><button className="toolbar-button icon-only" aria-label="打开整书笔记页面" title="整书笔记 N" onClick={() => void openNotesWorkspace()}><NotebookPen size={18} /></button><button className={`toolbar-button icon-only ${settingsOpen ? "selected" : ""}`} aria-label="阅读设置" onClick={() => { const next = !settingsOpen; closeOtherPanels(); setSettingsOpen(next); }}><SlidersHorizontal size={19} /></button><button className="toolbar-button icon-only hide-reader-toolbar" aria-label="隐藏顶部栏" title="隐藏顶部栏" onClick={() => { closeOtherPanels(); setToolbarHidden(true); }}><EyeOff size={18} /></button></div>
      </header>

      {toolbarHidden && <div className="reader-toolbar-reveal"><button className="show-reader-toolbar" aria-label="显示顶部栏" onClick={() => setToolbarHidden(false)}><Eye size={17} /><span>显示顶部栏</span></button></div>}

      {returnAvailable && <button className="return-reading-button" onClick={() => void returnToReading()}><ArrowUpLeft size={16} />返回刚才的阅读位置</button>}
      {readerMessage && <div className="reader-message" role="status"><span>{readerMessage}</span><button aria-label="关闭提示" onClick={() => setReaderMessage(null)}><X size={14} /></button></div>}
      {iframeDiagnostic && <aside className="iframe-diagnostic" aria-live="polite"><strong>iframe 诊断：allow-scripts {allowScriptedContent ? "开启" : "关闭"}</strong><span>touchstart {iframeDiagnosticEvents.touchstart ?? 0} · touchend {iframeDiagnosticEvents.touchend ?? 0}</span><span>selectionchange {iframeDiagnosticEvents.selectionchange ?? 0} · selected {iframeDiagnosticEvents.selected ?? 0} · poll {iframeDiagnosticEvents["selection-poll"] ?? 0}</span><small>此模式只记录事件，不翻页、不弹出笔记栏。</small></aside>}

      {tocOpen && <aside className="reader-panel toc-panel"><PanelHeading title="目录" subtitle={book.title} onClose={() => setTocOpen(false)} /><nav>{flattenToc(toc).map((item) => <button key={`${item.id}-${item.href}`} style={{ paddingLeft: `${11 + item.depth * 14}px` }} onClick={() => void goTo(item.href, item.label)}><span>{item.label}</span></button>)}</nav></aside>}

      {searchOpen && <aside className="reader-panel search-panel"><PanelHeading title="书内搜索" subtitle="跳转结果不会覆盖阅读进度" onClose={() => setSearchOpen(false)} /><form className="reader-search-form" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="输入关键词" /><button disabled={searching || !searchQuery.trim()}>{searching ? "搜索中" : "搜索"}</button></form><div className="search-results">{!searching && searchQuery && <small>找到 {searchResults.length} 处结果</small>}{searchResults.map((result) => <button key={result.id} onClick={() => void beginPreview(result.cfi)}><span>{result.excerpt}</span><small>{result.chapterTitle}</small></button>)}</div></aside>}

      {settingsOpen && <aside className="reader-panel settings-panel"><PanelHeading title="阅读设置" subtitle="自动记住阅读样式" onClose={() => setSettingsOpen(false)} /><div className="setting-group"><label>阅读方式</label><div className="segmented"><button className={readingMode === "paged" ? "active" : ""} onClick={() => setReadingMode("paged")}>分页</button><button className={readingMode === "scroll" ? "active" : ""} onClick={() => setReadingMode("scroll")}>滚动</button></div></div><div className="setting-group"><label>字号 <span>{fontSize}px</span></label><input type="range" min="15" max="26" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /><div className="font-size-preview" style={{ fontSize: `${fontSize}px` }} aria-live="polite">清晨翻开一页书，看看此字号是否舒适。</div></div><div className="setting-group"><label>阅读主题</label><div className="theme-options"><button className={readerTheme === "light" ? "active light-swatch" : "light-swatch"} onClick={() => setReaderTheme("light")}><Sun size={16} />明亮</button><button className={readerTheme === "paper" ? "active paper-swatch" : "paper-swatch"} onClick={() => setReaderTheme("paper")}><BookOpen size={16} />纸张</button><button className={readerTheme === "dark" ? "active dark-swatch" : "dark-swatch"} onClick={() => setReaderTheme("dark")}><Moon size={16} />夜间</button></div></div><div className="setting-group paging-diagnostic"><label>分页诊断 <button className="quiet-button" onClick={() => { setPagingDiagnosticEvents({}); setPagingLayout(null); setPagingDiagnosticEnabled((value) => !value); }}>{pagingDiagnosticEnabled ? "停止记录" : "开始记录"}</button></label><div className="paging-test-actions"><button onClick={() => { recordPagingDiagnostic("prev-requested"); turnPage("prev"); }}>上一页测试</button><button onClick={() => { recordPagingDiagnostic("next-requested"); turnPage("next"); }}>下一页测试</button></div>{pagingDiagnosticEnabled && <small>内容 {pagingDiagnosticEvents["content-start"] ?? 0}/{pagingDiagnosticEvents["content-end"] ?? 0} · Rendition {pagingDiagnosticEvents["rendition-start"] ?? 0}/{pagingDiagnosticEvents["rendition-end"] ?? 0} · 识别 {pagingDiagnosticEvents.recognized ?? 0} · 翻页请求 {(pagingDiagnosticEvents["next-requested"] ?? 0) + (pagingDiagnosticEvents["prev-requested"] ?? 0)} · 重定位 {pagingDiagnosticEvents.relocated ?? 0}{pagingLayout && <> · 列 {pagingLayout.contentWidth}/{pagingLayout.frameWidth}px（页宽 {pagingLayout.pageWidth}px）</>}</small>}</div><div className="shortcut-help"><strong>快捷键</strong><span>分页：← → / PageUp PageDown 翻页</span><span>滚动：↑ ↓ / PageUp PageDown / 空格</span><span>Ctrl+F 搜索 · T 目录 · N 整书笔记 · Esc 关闭</span></div></aside>}

      <main className="reading-stage">{readingMode === "paged" && !iosWeb && <button className="page-zone page-zone-left" aria-label="上一页" onClick={() => turnPage("prev")}><ChevronLeft size={25} /></button>}<div className="reading-paper epub-paper" ref={viewerRef} />{readingMode === "paged" && !iosWeb && <button className="page-zone page-zone-right" aria-label="下一页" onClick={() => turnPage("next")}><ChevronRight size={25} /></button>}{loading && <div className="reader-loading"><span className="loading-spinner" />正在载入 EPUB…</div>}{error && <div className="reader-error"><strong>无法打开这本书</strong><span>{error}</span><button onClick={onBack}>返回书库</button></div>}</main>

      {selectionDraft && <div className="selection-toolbar" style={{ left: selectionDraft.x, top: selectionDraft.y }} onClick={(event) => event.stopPropagation()}><button onClick={() => void createHighlight(selectionDraft, selectionDraft.reflection ?? "")}><Highlighter size={15} />高亮标记</button><button onClick={() => setReflectionDraft({ id: selectionDraft.annotationId, quote: selectionDraft.quote, reflection: selectionDraft.reflection ?? "", chapterTitle: selectionDraft.chapterTitle, chapterHref: selectionDraft.chapterHref, cfiRange: selectionDraft.cfiRange })}><MessageSquarePlus size={15} />{selectionDraft.annotationId ? "编辑笔记" : "添加笔记"}</button>{selectionDraft.annotationId && <button className="destructive-text" onClick={() => void deleteSelectionNote(selectionDraft)}><Trash2 size={15} />删除笔记</button>}<button aria-label="取消" onClick={() => { setSelectionDraft(null); clearReaderSelection(renditionRef.current); }}><X size={14} /></button></div>}
      {footnote && <div className="footnote-popover" style={{ left: footnote.x, top: footnote.y }} onClick={(event) => event.stopPropagation()}><div><strong>{footnote.title}</strong><button aria-label="关闭脚注" onClick={() => setFootnote(null)}><X size={14} /></button></div><p>{footnote.text}</p></div>}
      {reflectionDraft && <div className="reader-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setReflectionDraft(null); }}><div className="reflection-dialog">{iosWeb && <div className="mobile-note-header"><button onClick={() => setReflectionDraft(null)}>取消</button><strong>笔记</strong><button className="save-reflection" onClick={() => void saveReflection()}>完成</button></div>}<div><span>所选原文</span><blockquote>{reflectionDraft.quote}</blockquote></div><label>笔记<textarea autoFocus value={reflectionDraft.reflection} onChange={(event) => setReflectionDraft((current) => current ? { ...current, reflection: event.target.value } : null)} placeholder="添加笔记……" /></label>{!iosWeb && <div className="reflection-actions"><button onClick={() => setReflectionDraft(null)}>取消</button><button className="save-reflection" onClick={() => void saveReflection()}>保存到整书笔记</button></div>}</div></div>}
      <footer className="reader-footer"><button className="reader-progress-toggle" aria-label="切换百分比和页码进度" onClick={() => setShowPageNumbers((value) => !value)}>{readerProgressLabel(percentage, showPageNumbers, pagePosition)}</button></footer>
    </div>
  );
}

function clearReaderSelection(rendition: Rendition | null) {
  if (!rendition) return;
  const raw = rendition.getContents() as unknown as Array<{ window?: Window }> | { window?: Window };
  for (const contents of Array.isArray(raw) ? raw : [raw]) contents.window?.getSelection()?.removeAllRanges();
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

function refreshHighlights(rendition: Rendition, records: AnnotationRecord[], theme: ReaderTheme, previous: string[]) {
  const manager = rendition.annotations as unknown as { remove: (cfi: string, type: string) => void };
  for (const cfi of new Set([...previous, ...records.map((record) => record.cfiRange)])) {
    try { manager.remove(cfi, "highlight"); } catch { /* the CFI is outside this rendered view */ }
  }
  applyHighlights(rendition, records, theme);
  return records.map((record) => record.cfiRange);
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
      ` : `html, body {
        overflow: hidden !important;
        overscroll-behavior: none !important;
        -webkit-user-select: text !important;
        user-select: text !important;
        touch-action: auto;
      }`}
      img, svg, video, table { max-width: 100% !important; height: auto; }
      pre { max-width: 100% !important; white-space: pre-wrap !important; overflow-wrap: anywhere; }
      ::-webkit-scrollbar { width: 9px; height: 9px; }
      ::-webkit-scrollbar-track { background: ${palette.scrollTrack}; }
      ::-webkit-scrollbar-thumb { border: 2px solid ${palette.scrollTrack}; border-radius: 999px; background: ${palette.scrollThumb}; }
      .bookreader-note-target { outline: 2px solid ${palette.focus}; outline-offset: 5px; border-radius: 2px; }
    `;
  }
}
