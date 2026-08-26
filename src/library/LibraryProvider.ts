import type { AnnotationInput, AnnotationRecord, BookNote, BookRecord, LibraryState, ProgressInput } from "../types";

export interface LibraryProvider {
  loadLibrary(): Promise<LibraryState>;
  chooseLibraryDirectory(): Promise<LibraryState | null>;
  chooseAndImportEpubs(): Promise<BookRecord[]>;
  readBookBytes(bookId: string): Promise<ArrayBuffer>;
  persistProgress(input: ProgressInput): Promise<void>;
  setBookFinished(bookId: string, finished: boolean): Promise<BookRecord>;
  renameBook(bookId: string, title: string): Promise<BookRecord>;
  chooseCustomCover(bookId: string): Promise<BookRecord | null>;
  restoreBookCover(bookId: string): Promise<BookRecord>;
  loadAnnotations(bookId: string): Promise<AnnotationRecord[]>;
  saveAnnotation(input: AnnotationInput): Promise<AnnotationRecord>;
  removeAnnotation(bookId: string, annotationId: string): Promise<void>;
  loadBookNote(bookId: string): Promise<BookNote>;
  persistBookNote(bookId: string, summary: string): Promise<BookNote>;
  deleteBook(bookId: string): Promise<void>;
  listDeletedBooks(): Promise<BookRecord[]>;
  restoreDeletedBook(bookId: string): Promise<void>;
}
