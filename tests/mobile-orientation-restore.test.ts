import { describe, expect, it } from "vitest";
import { captureMobileOrientationRestore, hasOrientationViewportChange, shouldRestoreMobileOrientation } from "../src/reader/mobile-orientation-restore";

describe("mobile orientation restore", () => {
  it("captures one CFI across repeated orientation resize events", () => {
    const first = captureMobileOrientationRestore(null, "epubcfi(/6/4!/4/2)", 100, 1);
    const repeated = captureMobileOrientationRestore(first, "epubcfi(/6/6!/4/2)", 120, 2);
    expect(repeated).toEqual({ cfi: "epubcfi(/6/4!/4/2)", navigationAt: 100, generation: 1 });
  });

  it("uses a CFI anchor rather than viewport percentages and ignores keyboard-only height changes", () => {
    expect(hasOrientationViewportChange({ width: 390, height: 844 }, { width: 844, height: 390 })).toBe(true);
    expect(hasOrientationViewportChange({ width: 390, height: 844 }, { width: 390, height: 520 })).toBe(false);
  });

  it("cancels an old restoration after newer navigation and finishes cleanly", () => {
    const plan = captureMobileOrientationRestore(null, "epubcfi(/6/8!/4/2)", 100, 3);
    expect(shouldRestoreMobileOrientation(plan, 3, 100)).toBe(true);
    expect(shouldRestoreMobileOrientation(plan, 3, 101)).toBe(false);
    expect(shouldRestoreMobileOrientation(null, 3, 100)).toBe(false);
  });
});
