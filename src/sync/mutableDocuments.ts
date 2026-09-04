/** Shared documents edited by more than one device; changes require an eTag precondition. */
export type MutableDocumentKind = "annotation" | "book-note";

export function mutableDocumentKind(path: string): MutableDocumentKind | null {
  const parts = path.split("/");
  if (parts.length === 2 && parts[0] === "notes" && /^[0-9a-f-]{36}\.json$/i.test(parts[1])) return "book-note";
  if (parts.length === 3 && parts[0] === "annotations"
    && /^[0-9a-f-]{36}$/i.test(parts[1]) && /^[0-9a-f-]{36}\.json$/i.test(parts[2])) return "annotation";
  return null;
}

export const isMutableSharedDocument = (path: string) => mutableDocumentKind(path) !== null;
