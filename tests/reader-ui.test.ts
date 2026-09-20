import { describe, expect, it } from "vitest";
import { createRenditionSettings, findTocItemForSpineHref, isIOSWebDevice, isMobileWebDevice, readerProgressLabel, resolveEpubRelativePath, shouldAdvancePastMobileChapterCover, swipeDirection } from "../src/reader/reader-ui";

describe("reader UI helpers", () => {
  it("detects iPhone and touch iPad user agents without matching desktop Mac", () => {
    expect(isIOSWebDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isIOSWebDevice("Mozilla/5.0 (Macintosh)", "MacIntel", 5)).toBe(true);
    expect(isIOSWebDevice("Mozilla/5.0 (Macintosh)", "MacIntel", 0)).toBe(false);
  });

  it("keeps desktop browsers on the desktop reading path", () => {
    expect(isMobileWebDevice("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5)).toBe(true);
    expect(isMobileWebDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0)).toBe(false);
  });

  it("switches between percentage and generated EPUB page labels", () => {
    expect(readerProgressLabel(0.86, false, { current: 23, total: 235 })).toBe("86%");
    expect(readerProgressLabel(0.86, true, { current: 23, total: 235 })).toBe("23/235页");
  });

  it("resolves a cross-chapter footnote relative to the current section", () => {
    expect(resolveEpubRelativePath("OEBPS/Text/chapter-2.xhtml", "../Notes/footnotes.xhtml")).toBe("OEBPS/Notes/footnotes.xhtml");
  });

  it("keeps following spine documents available in scroll mode", () => {
    expect(createRenditionSettings("scroll")).toEqual({
      flow: "scrolled-continuous", overflow: "scroll", manager: "continuous", infinite: true,
    });
    expect(createRenditionSettings("scroll", false, false)).toEqual({
      flow: "scrolled-doc", overflow: "hidden", manager: "default", infinite: false,
    });
    expect(createRenditionSettings("paged")).toEqual({
      flow: "paginated", overflow: "hidden", manager: "default", infinite: false,
    });
  });

  it("moves a mobile chapter cover into its separate prose spine without skipping ordinary entries", () => {
    expect(shouldAdvancePastMobileChapterCover({ mobileReader: true, readingMode: "scroll", chapterLabel: "第 17 章 双面人", textLength: 12, hasIllustration: true })).toBe(true);
    expect(shouldAdvancePastMobileChapterCover({ mobileReader: true, readingMode: "scroll", chapterLabel: "封面", textLength: 0, hasIllustration: true })).toBe(false);
    expect(shouldAdvancePastMobileChapterCover({ mobileReader: false, readingMode: "scroll", chapterLabel: "第 17 章 双面人", textLength: 12, hasIllustration: true })).toBe(false);
  });

  it("retains the TOC chapter label for an adjacent split spine item", () => {
    const items = [{ href: "text/part0021_split_000.html#chapter", label: "第 17 章 双面人" }];
    expect(findTocItemForSpineHref(items, "text/part0021_split_001.html")).toBe(items[0]);
  });

  it("accepts quick, horizontal page swipes while rejecting vertical or slow motion", () => {
    expect(swipeDirection({ x: 340, y: 300 }, { x: 250, y: 345 }, 520)).toBe("next");
    expect(swipeDirection({ x: 40, y: 300 }, { x: 115, y: 265 }, 480)).toBe("prev");
    expect(swipeDirection({ x: 200, y: 200 }, { x: 225, y: 320 }, 300)).toBeNull();
    expect(swipeDirection({ x: 340, y: 300 }, { x: 250, y: 345 }, 600)).toBeNull();
  });
});
