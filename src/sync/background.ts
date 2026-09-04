import { accountInfo } from "../auth/microsoft";
import { getSetting, setSetting } from "../storage/database";
import { EXPERIMENT_PAUSE } from "./experimentGate";
import { PENDING_ONE_DRIVE_CONNECT } from "./pendingConnect";
import { syncNow, syncSnapshot } from "./engine";

export type BackgroundSyncFacts = {
  online: boolean;
  visible: boolean;
  startup: boolean;
  account: boolean;
  consent: boolean;
  enabled: boolean;
  paused: boolean;
  requiresAction: boolean;
};

export function shouldRunBackgroundSync(facts: BackgroundSyncFacts) {
  return facts.online
    && (facts.startup || facts.visible)
    && facts.account
    && facts.consent
    && facts.enabled
    && !facts.paused
    && !facts.requiresAction;
}

export type BackgroundSyncDependencies = {
  accountInfo: typeof accountInfo;
  getSetting: typeof getSetting;
  setSetting: typeof setSetting;
  syncNow: typeof syncNow;
  syncSnapshot: typeof syncSnapshot;
  online: () => boolean;
  visible: () => boolean;
};

const browserDependencies: BackgroundSyncDependencies = {
  accountInfo, getSetting, setSetting, syncNow, syncSnapshot,
  online: () => navigator.onLine,
  visible: () => document.visibilityState === "visible",
};

/**
 * Completes a user-requested post-redirect connect and, separately, decides whether
 * a non-blocking background sync is allowed. This never starts an interactive login.
 */
export async function coordinateBackgroundSync(
  { startup = false }: { startup?: boolean } = {},
  deps: BackgroundSyncDependencies = browserDependencies,
) {
  const account = await deps.accountInfo();
  const pending = !!await deps.getSetting<boolean>(PENDING_ONE_DRIVE_CONNECT);
  if (pending && account) {
    await deps.setSetting("syncConsent", true);
    await deps.setSetting("syncEnabled", true);
    await deps.setSetting(PENDING_ONE_DRIVE_CONNECT, false);
  }

  const [consent, enabled, paused] = await Promise.all([
    deps.getSetting<boolean>("syncConsent"),
    deps.getSetting<boolean>("syncEnabled"),
    deps.getSetting<boolean>(EXPERIMENT_PAUSE),
  ]);
  const eligible = shouldRunBackgroundSync({
    online: deps.online(), visible: deps.visible(), startup, account: !!account,
    consent: !!consent, enabled: !!enabled, paused: !!paused,
    requiresAction: !!deps.syncSnapshot().requiresAction,
  });
  if (!eligible) return false;
  await deps.syncNow();
  return true;
}
