import { describe, expect, it } from "vitest";
import { findCurrentTocItem, matchesCurrentTocItem } from "../src/reader/ui/MobileTocSheet";

describe("Mobile TOC current chapter matching", () => {
  it("matches the current EPUB document while ignoring fragments", () => {
    expect(matchesCurrentTocItem("Text/chapter-02.xhtml#start", "Text/chapter-02.xhtml#section-4")).toBe(true);
  });

  it("normalizes relative path segments before matching", () => {
    expect(matchesCurrentTocItem("Text/part/chapter.xhtml", "Text/part/../part/chapter.xhtml#toc")).toBe(true);
  });

  it("does not select a different chapter", () => {
    expect(matchesCurrentTocItem("Text/chapter-02.xhtml", "Text/chapter-03.xhtml")).toBe(false);
  });

  it("uses the current chapter label when several TOC items share a document", () => {
    const items = [
      { id: "1", href: "Text/chapter.xhtml#one", label: "第一节", depth: 0 },
      { id: "2", href: "Text/chapter.xhtml#two", label: "第二节", depth: 1 },
    ];
    expect(findCurrentTocItem(items, "Text/chapter.xhtml", "第二节")).toBe(items[1]);
    expect(findCurrentTocItem(items, "Text/chapter.xhtml", "未知章节")).toBeUndefined();
  });
});
