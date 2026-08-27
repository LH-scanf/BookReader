export function isIOSWebDevice(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
  maxTouchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
) {
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
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

export function swipeDirection(
  start: { x: number; y: number },
  end: { x: number; y: number },
  elapsedMs: number,
): "prev" | "next" | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (elapsedMs > 900 || Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 0.8) return null;
  return dx < 0 ? "next" : "prev";
}
