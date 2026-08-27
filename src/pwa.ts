import { registerSW } from "virtual:pwa-register";
import { setAvailablePwaUpdate, setPwaUpdateChecker } from "./pwa-update";

export function installPwa() {
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      const apply = () => update(true);
      setAvailablePwaUpdate(apply);
      window.dispatchEvent(new CustomEvent("bookreader-update", { detail: apply }));
    },
    onRegisteredSW(_swScriptUrl, registration) { setPwaUpdateChecker(() => registration?.update() ?? Promise.resolve()); },
    onOfflineReady() { window.dispatchEvent(new Event("bookreader-offline-ready")); },
    onRegisterError() { window.dispatchEvent(new Event("bookreader-offline-error")); },
  });
}
