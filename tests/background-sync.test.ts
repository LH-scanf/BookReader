import { expect, it, vi } from "vitest";
import { coordinateBackgroundSync, shouldRunBackgroundSync, type BackgroundSyncDependencies } from "../src/sync/background";
import { PENDING_ONE_DRIVE_CONNECT } from "../src/sync/pendingConnect";

function dependencies(settings: Record<string, unknown> = {}, account = true) {
  const syncNow = vi.fn(async () => undefined);
  const values = new Map(Object.entries(settings));
  const deps: BackgroundSyncDependencies = {
    accountInfo: vi.fn(async () => account ? { homeAccountId: "account" } : null) as never,
    recoverMicrosoftAccount: vi.fn(async () => null) as never,
    getSetting: vi.fn(async <T>(key: string) => values.get(key) as T | undefined),
    setSetting: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }),
    syncNow,
    syncSnapshot: vi.fn(() => ({ phase: "idle", message: "" })),
    online: () => true,
    visible: () => true,
  };
  return { deps, syncNow, values };
}

it("only permits automatic sync when the local-first background conditions are all satisfied", () => {
  const ready = { online: true, visible: true, startup: false, account: true, consent: true, enabled: true, paused: false, requiresAction: false };
  expect(shouldRunBackgroundSync(ready)).toBe(true);
  expect(shouldRunBackgroundSync({ ...ready, enabled: false })).toBe(false);
  expect(shouldRunBackgroundSync({ ...ready, consent: false })).toBe(false);
  expect(shouldRunBackgroundSync({ ...ready, online: false })).toBe(false);
  expect(shouldRunBackgroundSync({ ...ready, requiresAction: true })).toBe(false);
  expect(shouldRunBackgroundSync({ ...ready, visible: false })).toBe(false);
  expect(shouldRunBackgroundSync({ ...ready, visible: false, startup: true })).toBe(true);
});

it("syncs a cached, connected account in the background without making startup wait for it", async () => {
  const { deps, syncNow } = dependencies({ syncConsent: true, syncEnabled: true });
  const work = coordinateBackgroundSync({ startup: true }, deps);
  expect(syncNow).not.toHaveBeenCalled();
  await expect(work).resolves.toBe(true);
  expect(syncNow).toHaveBeenCalledOnce();
});

it("finishes a redirected first connect once, then starts the background sync", async () => {
  const { deps, syncNow, values } = dependencies({ [PENDING_ONE_DRIVE_CONNECT]: true });
  await expect(coordinateBackgroundSync({ startup: true }, deps)).resolves.toBe(true);
  expect(values.get("syncConsent")).toBe(true);
  expect(values.get("syncEnabled")).toBe(true);
  expect(values.get(PENDING_ONE_DRIVE_CONNECT)).toBe(false);
  expect(syncNow).toHaveBeenCalledOnce();
});

it("keeps a pending first connect when no account returned from the redirect", async () => {
  const { deps, syncNow, values } = dependencies({ [PENDING_ONE_DRIVE_CONNECT]: true }, false);
  await expect(coordinateBackgroundSync({ startup: true }, deps)).resolves.toBe(false);
  expect(values.get(PENDING_ONE_DRIVE_CONNECT)).toBe(true);
  expect(syncNow).not.toHaveBeenCalled();
});

it("does not retry an account that already requires explicit action", async () => {
  const { deps, syncNow } = dependencies({ syncConsent: true, syncEnabled: true });
  deps.syncSnapshot = vi.fn(() => ({ phase: "error", message: "", requiresAction: true }));
  await expect(coordinateBackgroundSync({}, deps)).resolves.toBe(false);
  expect(syncNow).not.toHaveBeenCalled();
});

it("recovers a previously connected account before starting the automatic sync", async () => {
  const { deps, syncNow } = dependencies({ syncConsent: true, syncEnabled: true }, false);
  deps.recoverMicrosoftAccount = vi.fn(async () => ({ homeAccountId: "recovered" })) as never;
  await expect(coordinateBackgroundSync({ startup: true }, deps)).resolves.toBe(true);
  expect(deps.recoverMicrosoftAccount).toHaveBeenCalledWith({ online: true, visible: true });
  expect(syncNow).toHaveBeenCalledOnce();
});
