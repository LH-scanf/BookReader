export type PwaUpdateAction = () => Promise<void>;

let availableUpdate: PwaUpdateAction | null = null;
let checkForUpdate: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function subscribePwaUpdate(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAvailablePwaUpdate() {
  return availableUpdate;
}

export function setAvailablePwaUpdate(update: PwaUpdateAction) {
  availableUpdate = update;
  notify();
}

export function setPwaUpdateChecker(check: (() => Promise<void>) | null) {
  checkForUpdate = check;
}

export async function requestPwaUpdateCheck() {
  await checkForUpdate?.();
}
