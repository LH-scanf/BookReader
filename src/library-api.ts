import type { LibraryProvider } from "./library/LibraryProvider";
import type { AnnotationInput, ProgressInput } from "./types";
export { isDesktopApp, subscribeLibraryChanges, subscribeBeforeClose } from "./platform";

let provider: Promise<LibraryProvider> | undefined;
const loadProvider = __WEB_BUILD__
  ? () => import("./library/WebProvider")
  : () => import("./library/TauriProvider");
export function getLibraryProvider(): Promise<LibraryProvider> {
  return provider ??= loadProvider();
}
export const loadLibrary = () => getLibraryProvider().then((p) => p.loadLibrary());
export const chooseLibraryDirectory = () => getLibraryProvider().then((p) => p.chooseLibraryDirectory());
export const chooseAndImportEpubs = () => getLibraryProvider().then((p) => p.chooseAndImportEpubs());
export const readBookBytes = (id: string) => getLibraryProvider().then((p) => p.readBookBytes(id));
export const persistProgress = (input: ProgressInput) => getLibraryProvider().then((p) => p.persistProgress(input));
export const setBookFinished = (id: string, finished: boolean) => getLibraryProvider().then((p) => p.setBookFinished(id, finished));
export const renameBook = (id: string, title: string) => getLibraryProvider().then((p) => p.renameBook(id, title));
export const chooseCustomCover = (id: string) => getLibraryProvider().then((p) => p.chooseCustomCover(id));
export const restoreBookCover = (id: string) => getLibraryProvider().then((p) => p.restoreBookCover(id));
export const loadAnnotations = (id: string) => getLibraryProvider().then((p) => p.loadAnnotations(id));
export const saveAnnotation = (input: AnnotationInput) => getLibraryProvider().then((p) => p.saveAnnotation(input));
export const removeAnnotation = (id: string, annotationId: string) => getLibraryProvider().then((p) => p.removeAnnotation(id, annotationId));
export const loadBookNote = (id: string) => getLibraryProvider().then((p) => p.loadBookNote(id));
export const persistBookNote = (id: string, summary: string) => getLibraryProvider().then((p) => p.persistBookNote(id, summary));
export const deleteBook = (id: string) => getLibraryProvider().then((p) => p.deleteBook(id));
export const listDeletedBooks = () => getLibraryProvider().then((p) => p.listDeletedBooks());
export const restoreDeletedBook = (id: string) => getLibraryProvider().then((p) => p.restoreDeletedBook(id));
