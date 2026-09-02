import { describe, expect, it } from "vitest";
import { resolveUiMode } from "../src/ui/ui-mode";

describe("App UI mode", () => {
  it("keeps a narrow Tauri window on the Desktop UI", () => {
    expect(resolveUiMode({ isDesktopApp: true, isMobileWebDevice: true, viewportWidth: 375 })).toBe("desktop");
  });

  it("uses the Mobile UI for a mobile web device", () => {
    expect(resolveUiMode({ isDesktopApp: false, isMobileWebDevice: true, viewportWidth: 1024 })).toBe("mobile");
  });

  it("keeps a narrow desktop browser on the Desktop UI in production", () => {
    expect(resolveUiMode({ isDesktopApp: false, isMobileWebDevice: false, viewportWidth: 375, allowNarrowViewportFallback: false })).toBe("desktop");
  });

  it("allows the narrow viewport fallback only for development preview", () => {
    expect(resolveUiMode({ isDesktopApp: false, isMobileWebDevice: false, viewportWidth: 375, allowNarrowViewportFallback: true })).toBe("mobile");
  });

  it("uses the Desktop UI for a normal desktop browser", () => {
    expect(resolveUiMode({ isDesktopApp: false, isMobileWebDevice: false, viewportWidth: 1280 })).toBe("desktop");
  });
});
