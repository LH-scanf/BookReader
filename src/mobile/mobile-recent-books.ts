import type { BookRecord } from "../types";

export const MOBILE_RECENT_OPEN_STORAGE_KEY = "bookreader-mobile-recent-open-v1";

export type MobileRecentOpenMap = Record<string, number>;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

type StoredRecentOpens = {
  version: 1;
  openedAtByBookId: MobileRecentOpenMap;
};

function getLocalStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function parseMobileRecentOpens(value: string | null): MobileRecentOpenMap {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || (parsed as { version?: unknown }).version !== 1) return {};
    const openedAtByBookId = (parsed as { openedAtByBookId?: unknown }).openedAtByBookId;
    if (!openedAtByBookId || typeof openedAtByBookId !== "object") return {};
    return Object.fromEntries(Object.entries(openedAtByBookId).filter(([bookId, openedAt]) => (
      Boolean(bookId) && typeof openedAt === "number" && Number.isFinite(openedAt) && openedAt >= 0
    )) as [string, number][]);
  } catch {
    return {};
  }
}

export function readMobileRecentOpens(storage: StorageLike | null = getLocalStorage()): MobileRecentOpenMap {
  if (!storage) return {};
  try {
    return parseMobileRecentOpens(storage.getItem(MOBILE_RECENT_OPEN_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function recordMobileBookOpen(bookId: string, openedAt = Date.now(), storage: StorageLike | null = getLocalStorage()): void {
  if (!bookId || !storage || !Number.isFinite(openedAt)) return;
  try {
    const next: StoredRecentOpens = {
      version: 1,
      openedAtByBookId: { ...readMobileRecentOpens(storage), [bookId]: openedAt },
    };
    storage.setItem(MOBILE_RECENT_OPEN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Recent-reading order is a local UI preference and must never block reading.
  }
}

function openedAtFor(bookId: string, recentOpens: MobileRecentOpenMap): number | null {
  const openedAt = recentOpens[bookId];
  return typeof openedAt === "number" && Number.isFinite(openedAt) ? openedAt : null;
}

export function sortMobileBooksByRecentOpen(books: BookRecord[], recentOpens: MobileRecentOpenMap): BookRecord[] {
  return books
    .map((book, index) => ({ book, index, openedAt: openedAtFor(book.id, recentOpens) }))
    .sort((left, right) => {
      if (left.openedAt !== null && right.openedAt !== null) return right.openedAt - left.openedAt || left.index - right.index;
      if (left.openedAt !== null) return -1;
      if (right.openedAt !== null) return 1;
      return left.index - right.index;
    })
    .map(({ book }) => book);
}

export function getMobileContinueBook(books: BookRecord[], recentOpens: MobileRecentOpenMap): BookRecord | null {
  const mostRecentBook = sortMobileBooksByRecentOpen(books, recentOpens)
    .find((book) => openedAtFor(book.id, recentOpens) !== null);
  return mostRecentBook && !mostRecentBook.finished ? mostRecentBook : null;
}
