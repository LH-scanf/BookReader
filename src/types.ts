export type View = "library" | "reader" | "settings";
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
};

export type LibraryState = {
  libraryDir: string | null;
  books: BookRecord[];
};

export type ProgressInput = {
  bookId: string;
  cfi: string | null;
  chapterHref: string | null;
  percentage: number;
};
