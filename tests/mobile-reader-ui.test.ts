import { describe, expect, it } from "vitest";
import { isMobileReaderCenterTap, mapIframePointToViewport, mobileReaderTapReason } from "../src/reader/mobile-reader-ui";

const tap = (overrides: Partial<Parameters<typeof isMobileReaderCenterTap>[0]> = {}) => isMobileReaderCenterTap({
  start: { x: 190, y: 390 }, end: { x: 191, y: 391 }, elapsedMs: 120, viewport: { width: 390, height: 844 }, hasSelection: false, interactiveTarget: false, ...overrides,
});

describe("Mobile Reader central tap", () => {
  it("maps scrolled-doc iframe coordinates into the visible app viewport", () => {
    const frame = { left: 0, top: -180 };
    const start = mapIframePointToViewport({ x: 195, y: 600 }, frame);
    const end = mapIframePointToViewport({ x: 196, y: 601 }, frame);
    expect(isMobileReaderCenterTap({ start, end, elapsedMs: 100, viewport: { width: 390, height: 844 }, hasSelection: false, interactiveTarget: false })).toBe(true);
  });
  it("recognizes a short, still tap in the central reading area", () => expect(tap()).toBe(true));
  it("does not mistake a vertical scroll for a tap", () => expect(tap({ end: { x: 191, y: 430 } })).toBe(false));
  it("rejects a click when earlier touchmove marked the gesture as moved", () => expect(tap({ moved: true })).toBe(false));
  it("reports the rejection reason used by the diagnostic panel", () => {
    const input = { start: { x: 190, y: 390 }, end: { x: 191, y: 391 }, elapsedMs: 120, viewport: { width: 390, height: 844 }, hasSelection: false, interactiveTarget: false };
    expect(mobileReaderTapReason({ ...input, hasTouchState: false })).toBe("no-touch-state");
    expect(mobileReaderTapReason({ ...input, moved: true })).toBe("moved");
    expect(mobileReaderTapReason({ ...input, hasSelection: true })).toBe("selection");
    expect(mobileReaderTapReason({ ...input, interactiveTarget: true })).toBe("interactive-target");
    expect(mobileReaderTapReason({ ...input, start: { x: 20, y: 390 }, end: { x: 21, y: 391 } })).toBe("outside-center");
    expect(mobileReaderTapReason(input)).toBe("accepted");
  });
  it("does not react while native text selection exists", () => expect(tap({ hasSelection: true })).toBe(false));
  it("does not react to a link or other interactive EPUB target", () => expect(tap({ interactiveTarget: true })).toBe(false));
  it("keeps edge gestures and long presses out of the control trigger", () => {
    expect(tap({ end: { x: 20, y: 390 } })).toBe(false);
    expect(tap({ elapsedMs: 520 })).toBe(false);
  });
});
