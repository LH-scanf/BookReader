import { describe, expect, it } from "vitest";
import type { BookRecord } from "../src/types";
import { MOBILE_RECENT_OPEN_STORAGE_KEY, getMobileContinueBook, readMobileRecentOpens, recordMobileBookOpen, sortMobileBooksByRecentOpen } from "../src/mobile/mobile-recent-books";

const book = (id: string, overrides: Partial<BookRecord> = {}): BookRecord => ({
  id, title: id, author: "", progress: 0, finished: false, coverDataUrl: null, cfi: null, chapterHref: null, importedAt: "2026-01-01T00:00:00.000Z", ...overrides,
});

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
}

describe("Mobile recent reading", () => {
  it("places B before A after A then B genuinely enter Reader", () => {
    const storage = memoryStorage();
    recordMobileBookOpen("A", 100, storage);
    recordMobileBookOpen("B", 200, storage);
    expect(sortMobileBooksByRecentOpen([book("A"), book("B")], readMobileRecentOpens(storage)).map(({ id }) => id)).toEqual(["B", "A"]);
  });

  it("shows the most recently opened unfinished book even at zero progress", () => {
    expect(getMobileContinueBook([book("A", { progress: 0 })], { A: 100 })).toMatchObject({ id: "A" });
  });

  it("does not backfill Continue Reading when the most recent book is finished", () => {
    expect(getMobileContinueBook([book("A"), book("B", { finished: true })], { A: 100, B: 200 })).toBeNull();
  });

  it("does not show Continue Reading without a recent-open record", () => {
    expect(getMobileContinueBook([book("A")], {})).toBeNull();
  });

  it("keeps never-opened books in their original relative order", () => {
    expect(sortMobileBooksByRecentOpen([book("A"), book("B"), book("C")], { B: 100 }).map(({ id }) => id)).toEqual(["B", "A", "C"]);
  });

  it("safely falls back when local data is corrupted", () => {
    const storage = memoryStorage({ [MOBILE_RECENT_OPEN_STORAGE_KEY]: "not-json" });
    expect(readMobileRecentOpens(storage)).toEqual({});
  });

  it("ignores old IDs that are no longer in the library", () => {
    expect(sortMobileBooksByRecentOpen([book("A"), book("B")], { missing: 300, A: 100 }).map(({ id }) => id)).toEqual(["A", "B"]);
    expect(getMobileContinueBook([book("A"), book("B")], { missing: 300 })).toBeNull();
  });
});
