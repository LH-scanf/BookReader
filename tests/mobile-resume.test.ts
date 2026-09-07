import { describe, expect, it } from "vitest";
import { needsMobileResumePercentageFallback, shouldPersistRelocated, shouldRestoreMobileResume } from "../src/reader/mobile-resume";

describe("mobile scrolled-doc resume pipeline", () => {
  it("restores a saved CFI only for normal mobile scroll resume", () => {
    expect(shouldRestoreMobileResume({ mobileReader: true, readingMode: "scroll", resumeCfi: "epubcfi(/6/4)", initialTarget: null })).toBe(true);
    expect(shouldRestoreMobileResume({ mobileReader: false, readingMode: "scroll", resumeCfi: "epubcfi(/6/4)", initialTarget: null })).toBe(false);
    expect(shouldRestoreMobileResume({ mobileReader: true, readingMode: "scroll", resumeCfi: "epubcfi(/6/4)", initialTarget: "epubcfi(/6/8)" })).toBe(false);
  });

  it("does not persist the chapter-start relocation while initial resume is correcting it", () => {
    expect(shouldPersistRelocated({ restoringInitialProgress: true, previewing: false, restoringOrientation: false })).toBe(false);
    expect(shouldPersistRelocated({ restoringInitialProgress: false, previewing: false, restoringOrientation: false })).toBe(true);
    expect(shouldPersistRelocated({ restoringInitialProgress: false, previewing: true, restoringOrientation: false })).toBe(false);
  });

  it("keeps CFI first but permits a percentage fallback for a material restored-location mismatch", () => {
    expect(needsMobileResumePercentageFallback(.62, .619)).toBe(false);
    expect(needsMobileResumePercentageFallback(.62, .58)).toBe(true);
    expect(needsMobileResumePercentageFallback(.62, undefined)).toBe(false);
  });
});
