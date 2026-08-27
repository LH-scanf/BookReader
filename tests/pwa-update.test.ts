import { describe, expect, it, vi } from "vitest";
import { getAvailablePwaUpdate, requestPwaUpdateCheck, setAvailablePwaUpdate, setPwaUpdateChecker, subscribePwaUpdate } from "../src/pwa-update";

describe("PWA update state", () => {
  it("notifies settings when an update is waiting and can request a registration check", async () => {
    const listener = vi.fn();
    const stop = subscribePwaUpdate(listener);
    const apply = vi.fn(async () => undefined);
    setAvailablePwaUpdate(apply);
    expect(getAvailablePwaUpdate()).toBe(apply);
    expect(listener).toHaveBeenCalledOnce();

    const check = vi.fn(async () => undefined);
    setPwaUpdateChecker(check);
    await requestPwaUpdateCheck();
    expect(check).toHaveBeenCalledOnce();
    stop();
  });
});
