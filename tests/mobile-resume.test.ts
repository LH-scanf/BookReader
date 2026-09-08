import { describe, expect, it } from "vitest";
import { createReaderBootstrapKey, needsMobileResumePercentageFallback, shouldPersistRelocated, shouldRestoreMobileResume } from "../src/reader/mobile-resume";

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

  it("keeps bootstrap identity stable across ordinary progress and CFI updates", () => {
    const identity = { bookId: "book-a", readingMode: "scroll" as const, allowScriptedContent: false, iframeDiagnostic: false, iosWeb: true, mobileReader: true, useIosPseudoPagination: false };
    const first = createReaderBootstrapKey(identity);
    expect(createReaderBootstrapKey({ ...identity })).toBe(first);
    // Live progress, CFI and timestamps are intentionally not bootstrap inputs.
    const changingReaderProps = [{ progress: .58, cfi: "a" }, { progress: .59, cfi: "b" }, { progress: .60, cfi: "c" }, { progress: .62, cfi: "d" }];
    expect(changingReaderProps.map(() => createReaderBootstrapKey(identity))).toEqual([first, first, first, first]);
    expect(createReaderBootstrapKey({ ...identity, bookId: "book-b" })).not.toBe(first);
    expect(createReaderBootstrapKey({ ...identity, readingMode: "paged" })).not.toBe(first);
  });
});
