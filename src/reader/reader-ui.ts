export function isIOSWebDevice(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
  maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
) {
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function isMobileWebDevice(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
  maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
) {
  return /Android|iPad|iPhone|iPod|Mobile/i.test(userAgent)
    || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function readerProgressLabel(
  percentage: number,
  showPages: boolean,
  page: { current: number; total: number } | null,
) {
  if (showPages && page) return `${page.current}/${page.total}页`;
  return `${Math.round(percentage * 100)}%`;
}

export function resolveEpubRelativePath(currentHref: string, targetPath: string) {
  if (!targetPath) return currentHref.split("#")[0];
  const base = currentHref.split("#")[0].split("/");
  base.pop();
  const parts = targetPath.startsWith("/") ? [] : base;
  for (const part of targetPath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

/**
 * EPUBs are allowed to split one logical chapter across several spine files.
 * A scroll reader must therefore keep adjacent spine items rendered; the
 * default epub.js manager only displays the target document.
 */
export function createRenditionSettings(
  readingMode: "paged" | "scroll",
  useIosPseudoPagination = false,
  supportsContinuousSpine = true,
) {
  const scrolling = useIosPseudoPagination || readingMode === "scroll";
  const continuous = scrolling && supportsContinuousSpine;
  return {
    flow: scrolling ? continuous ? "scrolled-continuous" : "scrolled-doc" : "paginated",
    overflow: continuous ? "scroll" : "hidden",
    manager: continuous ? "continuous" : "default",
    infinite: continuous,
  };
}

export function shouldAdvancePastMobileChapterCover({
  mobileReader,
  readingMode,
  chapterLabel,
  textLength,
  hasIllustration,
}: {
  mobileReader: boolean;
  readingMode: "paged" | "scroll";
  chapterLabel: string;
  textLength: number;
  hasIllustration: boolean;
}) {
  return mobileReader
    && readingMode === "scroll"
    && /(?:第\s*\d+\s*章|chapter\s+\d+)/i.test(chapterLabel)
    && hasIllustration
    && textLength <= 160;
}

export function findTocItemForSpineHref<T extends { href: string }>(items: T[], href: string) {
  const path = href.split("#")[0];
  const exact = items.find((item) => path.includes(item.href.split("#")[0]));
  if (exact) return exact;
  const splitStem = (value: string) => value.split("#")[0].replace(/_split_\d+(?=\.[^/]+$)/, "_split");
  const stem = splitStem(path);
  return items.find((item) => splitStem(item.href) === stem);
}

export function swipeDirection(
  start: { x: number; y: number },
  end: { x: number; y: number },
  elapsedMs: number,
): "prev" | "next" | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (elapsedMs > 550 || Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy) * 1.35) return null;
  if (Math.abs(dx) / Math.max(elapsedMs, 1) < 0.12) return null;
  return dx < 0 ? "next" : "prev";
}
