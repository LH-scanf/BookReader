import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { BookRecord, LibraryState, ProgressInput } from "./types";

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

export async function deleteBook(bookId: string): Promise<void> {
  await invoke("delete_book", { bookId });
}
