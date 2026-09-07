import { expect, it } from "vitest";
import { shouldShowSyncNotice } from "../src/WebStatus";

it("does not block the mobile reader for a transient Graph failure", () => {
  expect(shouldShowSyncNotice("mobile", { phase: "error", transient: true }, "")).toBe(false);
  expect(shouldShowSyncNotice("desktop", { phase: "error", transient: true }, "")).toBe(true);
  expect(shouldShowSyncNotice("mobile", { phase: "error", requiresAction: true }, "")).toBe(true);
});
