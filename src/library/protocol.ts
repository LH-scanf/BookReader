export type LifecycleOperation = {
  schemaVersion: 1; id: string; bookId: string; deviceId: string;
  action: "delete" | "restore"; restores: string[]; createdAt: string;
};
export type Metadata = {
  schemaVersion: number; id: string; title: string; author: string; importedAt: string;
  sourceFileName: string; coverFileName: string | null;
  language?: string | null; description?: string | null; publisher?: string | null;
};
export type Progress = {
  schemaVersion: number; cfi: string | null; chapterHref: string | null;
  percentage: number; finished: boolean; updatedAt: string;
};
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function requireId(id: string) { if (!uuidPattern.test(id)) throw new Error("无效的记录 ID"); }
export function activeDeletions(operations: LifecycleOperation[]): string[] {
  const restored = new Set(operations.filter((op) => op.action === "restore").flatMap((op) => op.restores));
  return operations.filter((op) => op.action === "delete" && !restored.has(op.id)).map((op) => op.id);
}
export function parseLifecycle(value: unknown, bookId: string, operationId: string): LifecycleOperation {
  const op = value as LifecycleOperation;
  if (!op || op.schemaVersion !== 1 || op.bookId !== bookId || op.id !== operationId
    || !uuidPattern.test(op.id) || !uuidPattern.test(op.deviceId)
    || !["delete", "restore"].includes(op.action) || !Array.isArray(op.restores)
    || !op.restores.every((id) => typeof id === "string" && uuidPattern.test(id))
    || !Number.isFinite(Date.parse(op.createdAt))) throw new Error("删除/恢复记录损坏，已停止加载以保护书库");
  return op;
}
export function parseMetadata(value: unknown, id: string): Metadata {
  const meta = value as Metadata;
  if (!meta || meta.schemaVersion !== 1 || meta.id !== id || !uuidPattern.test(id)
    || typeof meta.title !== "string" || typeof meta.author !== "string" || !Number.isFinite(Date.parse(meta.importedAt))) {
    throw new Error("图书元数据无效或版本不受支持");
  }
  if (meta.coverFileName && !/^[\w.-]+$/.test(meta.coverFileName)) throw new Error("封面文件名无效");
  return meta;
}
export function validProgress(value: unknown): value is Progress {
  const p = value as Progress;
  return !!p && p.schemaVersion === 1 && Number.isFinite(p.percentage) && p.percentage >= 0 && p.percentage <= 1
    && typeof p.finished === "boolean" && (p.cfi === null || typeof p.cfi === "string")
    && (p.chapterHref === null || typeof p.chapterHref === "string") && Number.isFinite(Date.parse(p.updatedAt));
}
