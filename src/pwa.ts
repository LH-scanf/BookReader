import { registerSW } from "virtual:pwa-register";

export function installPwa() {
  const update = registerSW({
    immediate: true,
    onNeedRefresh() { window.dispatchEvent(new CustomEvent("bookreader-update", { detail: () => update(true) })); },
    onOfflineReady() { window.dispatchEvent(new Event("bookreader-offline-ready")); },
    onRegisterError() { window.dispatchEvent(new Event("bookreader-offline-error")); },
  });
}
