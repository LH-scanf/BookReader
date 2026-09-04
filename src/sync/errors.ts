/** A failure that needs an explicit account or consent action, never a background retry. */
export class SyncActionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncActionRequiredError";
  }
}

/** A conditional write found a different shared document version on OneDrive. */
export class SyncConflictError extends Error {
  constructor(path: string) {
    super(`云端文件与本机待上传内容冲突：${path}。已停止自动覆盖，两份内容均保留，请先备份并核对`);
    this.name = "SyncConflictError";
  }
}
