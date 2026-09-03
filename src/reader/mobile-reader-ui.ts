export type MobileReaderTapInput = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  elapsedMs: number;
  viewport: { width: number; height: number };
  hasSelection: boolean;
  interactiveTarget: boolean;
  moved?: boolean;
  hasTouchState?: boolean;
};

export function mobileReaderTapReason({ start, end, elapsedMs, viewport, hasSelection, interactiveTarget, moved = false, hasTouchState = true }: MobileReaderTapInput) {
  if (!hasTouchState) return "no-touch-state";
  if (moved || Math.hypot(end.x - start.x, end.y - start.y) > 12) return "moved";
  if (elapsedMs > 450) return "long-press";
  if (hasSelection) return "selection";
  if (interactiveTarget) return "interactive-target";
  if (!(end.x >= viewport.width * 0.16 && end.x <= viewport.width * 0.84 && end.y >= viewport.height * 0.18 && end.y <= viewport.height * 0.82)) return "outside-center";
  return "accepted";
}

export function isMobileReaderCenterTap(input: MobileReaderTapInput): boolean {
  const { start, end } = input;
  if (mobileReaderTapReason(input) !== "accepted") return false;
  if (Math.hypot(end.x - start.x, end.y - start.y) > 12) return false;
  return true;
}

export function mapIframePointToViewport(point: { x: number; y: number }, frame: { left: number; top: number }) {
  return { x: frame.left + point.x, y: frame.top + point.y };
}
