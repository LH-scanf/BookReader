import { useEffect } from "react";
import { coordinateBackgroundSync } from "./background";

/** Web/PWA lifecycle owner. Rendering it never waits for sync to finish. */
export default function BackgroundSync() {
  useEffect(() => {
    let disposed = false;
    const attempt = (startup = false) => {
      if (disposed) return;
      void coordinateBackgroundSync({ startup }).catch(() => undefined);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") attempt(); };
    const onOnline = () => attempt();
    attempt(true);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    const heartbeat = window.setInterval(() => attempt(), 60_000);
    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(heartbeat);
    };
  }, []);
  return null;
}
