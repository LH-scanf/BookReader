import { describe, expect, it } from "vitest";
import { sortAnnotationsByReadingOrder } from "../src/reader/ui/MobileReaderNotesSheet";
import type { AnnotationRecord } from "../src/types";

function annotation(id: string, cfiRange: string): AnnotationRecord {
  return { schemaVersion: 1, id, bookId: "book", recordType: "quote-note", quote: id, reflection: "", chapterTitle: "", chapterHref: "", cfiRange, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null };
}

describe("mobile reader notes order", () => {
  it("uses the supplied EPUB CFI comparison instead of creation time", () => {
    const first = annotation("first", "cfi-1");
    const second = annotation("second", "cfi-2");
    expect(sortAnnotationsByReadingOrder([second, first], (left, right) => left.localeCompare(right)).map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("keeps the loaded order when a CFI cannot be compared", () => {
    const first = annotation("first", "bad-1");
    const second = annotation("second", "bad-2");
    expect(sortAnnotationsByReadingOrder([second, first], () => { throw new Error("malformed CFI"); }).map((item) => item.id)).toEqual(["second", "first"]);
  });
});
