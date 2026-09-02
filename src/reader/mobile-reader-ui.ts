export function isMobileReaderCenterTap({ start, end, elapsedMs, viewport, hasSelection, interactiveTarget }: {
  start: { x: number; y: number };
  end: { x: number; y: number };
  elapsedMs: number;
  viewport: { width: number; height: number };
  hasSelection: boolean;
  interactiveTarget: boolean;
}): boolean {
  if (hasSelection || interactiveTarget || elapsedMs > 450) return false;
  if (Math.hypot(end.x - start.x, end.y - start.y) > 12) return false;
  return end.x >= viewport.width * 0.16 && end.x <= viewport.width * 0.84 && end.y >= viewport.height * 0.18 && end.y <= viewport.height * 0.82;
}

export function mapIframePointToViewport(point: { x: number; y: number }, frame: { left: number; top: number }) {
  return { x: frame.left + point.x, y: frame.top + point.y };
}
