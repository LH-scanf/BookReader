import { describe, expect, it } from "vitest";
import { isIOSWebDevice, readerProgressLabel, resolveEpubRelativePath } from "../src/reader/reader-ui";

describe("reader UI helpers", () => {
  it("detects iPhone and touch iPad user agents without matching desktop Mac", () => {
    expect(isIOSWebDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(isIOSWebDevice("Mozilla/5.0 (Macintosh)", "MacIntel", 5)).toBe(true);
    expect(isIOSWebDevice("Mozilla/5.0 (Macintosh)", "MacIntel", 0)).toBe(false);
  });

  it("switches between percentage and generated EPUB page labels", () => {
    expect(readerProgressLabel(0.86, false, { current: 23, total: 235 })).toBe("86%");
    expect(readerProgressLabel(0.86, true, { current: 23, total: 235 })).toBe("23/235页");
  });

  it("resolves a cross-chapter footnote relative to the current section", () => {
    expect(resolveEpubRelativePath("OEBPS/Text/chapter-2.xhtml", "../Notes/footnotes.xhtml")).toBe("OEBPS/Notes/footnotes.xhtml");
  });
});
