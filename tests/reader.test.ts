import type { Rendition } from "epubjs";
import { expect, it, vi } from "vitest";
import { characterRanges, installPreciseMapping } from "../src/reader/precise-mapping";

it("preserves exact UTF-16 CFI offsets including leading whitespace and surrogate pairs", () => {
  const node = document.createTextNode("  中文📖阅读");
  const ranges = characterRanges(node);
  expect(ranges.map((range) => range.toString())).toEqual([" ", " ", "中", "文", "📖", "阅", "读"]);
  expect(ranges.map((range) => [range.startOffset, range.endOffset])).toEqual([[0,1],[1,2],[2,3],[3,4],[4,6],[6,7],[7,8]]);
});
it("splits Chinese ranges across columns while retaining the original English mapping", () => {
  const original = vi.fn(() => [] as Range[]); const mapping = { splitTextNodeIntoRanges: original };
  const rendition = { manager: { mapping } } as unknown as Rendition;
  installPreciseMapping(rendition); installPreciseMapping(rendition);
  expect(mapping.splitTextNodeIntoRanges(document.createTextNode("没有空格的中文段落"))).toHaveLength(9);
  mapping.splitTextNodeIntoRanges(document.createTextNode("English paragraph")); expect(original).toHaveBeenCalledOnce();
});
it("reapplies the adapter when epub.js replaces its mapping after a layout change", () => {
  const mapping = () => ({ splitTextNodeIntoRanges: (_node: Node) => [] as Range[] });
  const manager = { mapping: mapping(), setLayout() { this.mapping = mapping(); }, currentLocation() { this.setLayout(); return this.mapping.splitTextNodeIntoRanges(document.createTextNode("中文")); } };
  installPreciseMapping({ manager } as unknown as Rendition);
  manager.mapping = mapping();
  expect(manager.currentLocation()).toHaveLength(2);
});
