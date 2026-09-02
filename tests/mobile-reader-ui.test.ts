import { describe, expect, it } from "vitest";
import { isMobileReaderCenterTap } from "../src/reader/mobile-reader-ui";

const tap = (overrides: Partial<Parameters<typeof isMobileReaderCenterTap>[0]> = {}) => isMobileReaderCenterTap({
  start: { x: 190, y: 390 }, end: { x: 191, y: 391 }, elapsedMs: 120, viewport: { width: 390, height: 844 }, hasSelection: false, interactiveTarget: false, ...overrides,
});

describe("Mobile Reader central tap", () => {
  it("recognizes a short, still tap in the central reading area", () => expect(tap()).toBe(true));
  it("does not mistake a vertical scroll for a tap", () => expect(tap({ end: { x: 191, y: 430 } })).toBe(false));
  it("does not react while native text selection exists", () => expect(tap({ hasSelection: true })).toBe(false));
  it("does not react to a link or other interactive EPUB target", () => expect(tap({ interactiveTarget: true })).toBe(false));
  it("keeps edge gestures and long presses out of the control trigger", () => {
    expect(tap({ end: { x: 20, y: 390 } })).toBe(false);
    expect(tap({ elapsedMs: 520 })).toBe(false);
  });
});
