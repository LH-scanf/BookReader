/** A failure that needs an explicit account or consent action, never a background retry. */
export class SyncActionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncActionRequiredError";
  }
}
