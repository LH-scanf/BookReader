export type View = "library" | "reader" | "notes" | "settings";
export type LibraryFilter = "all" | "finished";
export type ReadingMode = "paged" | "scroll";
export type ReaderTheme = "paper" | "light" | "dark";

export type BookRecord = {
  id: string;
  title: string;
  author: string;
  progress: number;
  finished: boolean;
  coverDataUrl: string | null;
  cfi: string | null;
  chapterHref: string | null;
  importedAt: string;
  progressUpdatedAt?: string;
  progressDeviceId?: string | null;
  cached?: boolean;
};

export type LibraryState = {
  libraryDir: string | null;
  deviceId?: string | null;
  books: BookRecord[];
};

export type ProgressInput = {
  bookId: string;
  cfi: string | null;
  chapterHref: string | null;
  percentage: number;
};

export type AnnotationRecord = {
  schemaVersion: number;
  id: string;
  bookId: string;
  recordType: "quote-note";
  quote: string;
  reflection: string;
  chapterTitle: string;
  chapterHref: string;
  cfiRange: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AnnotationInput = {
  id?: string;
  bookId: string;
  quote: string;
  reflection: string;
  chapterTitle: string;
  chapterHref: string;
  cfiRange: string;
};

export type BookNote = {
  schemaVersion: number;
  bookId: string;
  summary: string;
  updatedAt: string;
};
