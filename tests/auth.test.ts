import { expect, it, vi } from "vitest";
import { getSetting } from "../src/storage/database";

const state = vi.hoisted(() => ({ account: { homeAccountId: "personal-a", username: "a@example.test" } }));
vi.mock("@azure/msal-browser", () => ({
  InteractionRequiredAuthError: class extends Error {},
  PublicClientApplication: class {
    async initialize() {}
    async handleRedirectPromise() { return null; }
    getActiveAccount() { return state.account; }
    getAllAccounts() { return [state.account]; }
  },
}));
it("pins the local library to one account and rejects a different account without rebinding", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  const { requireAccount } = await import("../src/auth/microsoft");
  state.account = { homeAccountId: "personal-a", username: "a@example.test" };
  await requireAccount(); expect(await getSetting("boundAccount")).toBe("personal-a");
  state.account = { homeAccountId: "personal-b", username: "b@example.test" };
  await expect(requireAccount()).rejects.toThrow("另一个微软账号");
  expect(await getSetting("boundAccount")).toBe("personal-a");
  vi.unstubAllEnvs();
});
