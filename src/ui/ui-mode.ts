import { useState } from "react";
import { isDesktopApp } from "../platform";
import { isMobileWebDevice } from "../reader/reader-ui";

export type UiMode = "desktop" | "mobile";

export type UiModeInput = {
  isDesktopApp: boolean;
  isMobileWebDevice: boolean;
  viewportWidth: number;
  allowNarrowViewportFallback?: boolean;
};

/**
 * The sole App-shell UI mode decision. Tauri always wins so a narrow Windows
 * window never receives the Mobile UI. The viewport fallback is intentionally
 * limited to browser development and does not replace device detection.
 */
export function resolveUiMode({
  isDesktopApp: desktopApp,
  isMobileWebDevice: mobileWebDevice,
  viewportWidth,
  allowNarrowViewportFallback = false,
}: UiModeInput): UiMode {
  if (desktopApp) return "desktop";
  if (mobileWebDevice) return "mobile";
  return allowNarrowViewportFallback && viewportWidth <= 720 ? "mobile" : "desktop";
}

export function getCurrentUiMode(): UiMode {
  return resolveUiMode({
    isDesktopApp: isDesktopApp(),
    isMobileWebDevice: isMobileWebDevice(),
    viewportWidth: typeof window === "undefined" ? Number.POSITIVE_INFINITY : window.innerWidth,
    allowNarrowViewportFallback: import.meta.env.DEV,
  });
}

export function useUiMode(): UiMode {
  const [uiMode] = useState<UiMode>(getCurrentUiMode);
  return uiMode;
}
