import type { Rendition } from "epubjs";

// epub.js 0.3.x Mapping splits text on spaces. A Chinese paragraph can span
// columns without any spaces, so its bounding rect points to the previous page.
// Patch only this rendition's mapping, never the library's global prototype.
type Mapping = { splitTextNodeIntoRanges: (node: Node, splitter?: string) => Range[] };
const patched = new WeakSet<Mapping>();
type Manager = { mapping?: Mapping; setLayout?: (...args: unknown[]) => unknown };
const managers = new WeakSet<Manager>();
export function characterRanges(node: Node): Range[] {
  const doc = node.ownerDocument!; const ranges: Range[] = [];
  let offset = 0;
  for (const character of node.textContent ?? "") {
    const range = doc.createRange(); range.setStart(node, offset); offset += character.length; range.setEnd(node, offset); ranges.push(range);
  }
  return ranges;
}
export function installPreciseMapping(rendition: Rendition) {
  const manager = (rendition as unknown as { manager?: Manager }).manager;
  if (!manager) return;
  // Layout/axis updates replace manager.mapping after the rendered callback.
  // currentLocation itself calls updateLayout, which creates a new Mapping.
  // Patch AFTER setLayout rather than before currentLocation.
  if (manager.setLayout && !managers.has(manager)) {
    const setLayout = manager.setLayout;
    manager.setLayout = function (...args) { const result = setLayout.apply(this, args); patchMapping(this.mapping); return result; };
    managers.add(manager);
  }
  patchMapping(manager.mapping);
}
function patchMapping(mapping?: Mapping) {
  if (!mapping || patched.has(mapping)) return;
  const original = mapping.splitTextNodeIntoRanges;
  if (typeof original !== "function") throw new Error("epub.js 定位接口已改变，请检查阅读器兼容性");
  mapping.splitTextNodeIntoRanges = function (node, splitter) {
    if (node?.nodeType === 3 && /[\u2e80-\u9fff\uf900-\ufaff]/u.test(node.textContent ?? "")) return characterRanges(node);
    return original.call(this, node, splitter);
  };
  patched.add(mapping);
}
