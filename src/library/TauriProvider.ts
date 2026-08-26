import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AnnotationInput, AnnotationRecord, BookNote, BookRecord, LibraryState, ProgressInput } from "../types";

export function isDesktopApp() {
  return "__TAURI_INTERNALS__" in window;
}

export async function loadLibrary(): Promise<LibraryState> {
  if (!isDesktopApp()) return { libraryDir: null, books: [] };
  return invoke<LibraryState>("get_library_state");
}

export async function chooseLibraryDirectory(): Promise<LibraryState | null> {
  if (!isDesktopApp()) throw new Error("请在 BookReader 桌面程序中选择书库目录。");
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 BookReader 书库目录",
  });
  if (!selected || Array.isArray(selected)) return null;
  return invoke<LibraryState>("set_library_directory", { path: selected });
}

export async function chooseAndImportEpubs(): Promise<BookRecord[]> {
  if (!isDesktopApp()) throw new Error("请在 BookReader 桌面程序中导入 EPUB。");
  const selected = await open({
    directory: false,
    multiple: true,
    title: "导入 EPUB 图书",
    filters: [{ name: "EPUB 图书", extensions: ["epub"] }],
  });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  return Promise.all(paths.map((sourcePath) => invoke<BookRecord>("import_epub", { sourcePath })));
}

export async function readBookBytes(bookId: string): Promise<ArrayBuffer> {
  const encoded = await invoke<string>("read_book_base64", { bookId });
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function persistProgress(input: ProgressInput): Promise<void> {
  await invoke("save_progress", { input });
}

export async function setBookFinished(bookId: string, finished: boolean): Promise<BookRecord> {
  return invoke<BookRecord>("set_book_finished", { bookId, finished });
}

export async function renameBook(bookId: string, title: string): Promise<BookRecord> {
  return invoke<BookRecord>("rename_book", { bookId, title });
}

export async function chooseCustomCover(bookId: string): Promise<BookRecord | null> {
  if (!isDesktopApp()) throw new Error("请在 BookReader 桌面程序中更换封面。");
  const selected = await open({
    directory: false,
    multiple: false,
    title: "选择图书封面",
    filters: [{ name: "封面图片", extensions: ["jpg", "jpeg", "png", "webp"] }],
  });
  if (!selected || Array.isArray(selected)) return null;
  return invoke<BookRecord>("set_custom_cover", { bookId, sourcePath: selected });
}

export async function restoreBookCover(bookId: string): Promise<BookRecord> {
  return invoke<BookRecord>("restore_book_cover", { bookId });
}

export async function loadAnnotations(bookId: string): Promise<AnnotationRecord[]> {
  return invoke<AnnotationRecord[]>("list_annotations", { bookId });
}

export async function saveAnnotation(input: AnnotationInput): Promise<AnnotationRecord> {
  return invoke<AnnotationRecord>("save_annotation", { input });
}

export async function removeAnnotation(bookId: string, annotationId: string): Promise<void> {
  await invoke("delete_annotation", { bookId, annotationId });
}

export async function loadBookNote(bookId: string): Promise<BookNote> {
  return invoke<BookNote>("get_book_note", { bookId });
}

export async function persistBookNote(bookId: string, summary: string): Promise<BookNote> {
  return invoke<BookNote>("save_book_note", { bookId, summary });
}

export async function deleteBook(bookId: string): Promise<void> {
  await invoke("delete_book", { bookId });
}

export async function listDeletedBooks(): Promise<BookRecord[]> { return invoke("list_deleted_books"); }
export async function restoreDeletedBook(bookId: string): Promise<void> { await invoke("restore_deleted_book", { bookId }); }
