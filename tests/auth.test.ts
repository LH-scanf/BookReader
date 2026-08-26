import { expect, it, vi } from "vitest";
import { getSetting } from "../src/storage/database";

const state = vi.hoisted(() => ({ account: { homeAccountId: "personal-a", username: "a@example.test" }, scopes: ["Files.ReadWrite.AppFolder"] }));
vi.mock("@azure/msal-browser", () => ({
  InteractionRequiredAuthError: class extends Error {},
  PublicClientApplication: class {
    async initialize() {}
    async handleRedirectPromise() { return null; }
    getActiveAccount() { return state.account; }
    getAllAccounts() { return [state.account]; }
    async acquireTokenSilent() { return { scopes: state.scopes, accessToken: "test-access-token" }; }
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
it.each(["Files.ReadWrite.AppFolder", "https://graph.microsoft.com/Files.ReadWrite.AppFolder"])("accepts granted app-folder scope metadata: %s", async (scope) => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001"); state.scopes = [scope];
  try { const { accessToken } = await import("../src/auth/microsoft"); expect(await accessToken()).toBe("test-access-token"); }
  finally { vi.unstubAllEnvs(); }
});
it("rejects a cached authorization without app-folder scope without exposing its token", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001"); state.scopes = ["openid", "profile", "User.Read"];
  try {
    const { accessToken } = await import("../src/auth/microsoft");
    await expect(accessToken()).rejects.toThrow("当前授权未包含 Files.ReadWrite.AppFolder");
    await expect(accessToken()).rejects.not.toThrow("test-access-token");
  } finally { vi.unstubAllEnvs(); }
});
