export const isDesktopApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function subscribeLibraryChanges(callback: () => void): Promise<() => void> {
  if (isDesktopApp()) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen("library-changed", callback);
  }
  window.addEventListener("bookreader-library-changed", callback);
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("bookreader-library");
  channel?.addEventListener("message", callback);
  return () => { window.removeEventListener("bookreader-library-changed", callback); channel?.close(); };
}

export function notifyLibraryChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("bookreader-library-changed"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("bookreader-library");
    channel.postMessage("changed");
    channel.close();
  }
}

export async function subscribeBeforeClose(save: () => Promise<void>): Promise<() => void> {
  if (isDesktopApp()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    let closing = false;
    return appWindow.onCloseRequested(async (event) => {
      if (closing) return;
      event.preventDefault();
      try { await save(); closing = true; await appWindow.destroy(); }
      catch { /* save reports the error; keep the window open to avoid losing data */ }
    });
  }
  const flush = () => { void save().catch(() => undefined); };
  const visibility = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", flush);
  return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", flush); };
}
