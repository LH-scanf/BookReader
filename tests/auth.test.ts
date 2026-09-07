import { expect, it, vi } from "vitest";
import { database, getSetting, setSetting } from "../src/storage/database";
import { authorizeNarrowRetest, authorizeWideExperiment, cleanupExperimentProbe, finishPermissionExperiment,
  preparePermissionExperiment, readPermissionExperiment, runNarrowRetest, runWideExperiment } from "../src/sync/permissionExperiment";

const state = vi.hoisted(() => ({ account: { homeAccountId: "personal-a", username: "a@example.test" } as { homeAccountId: string; username: string } | null, scopes: ["Files.ReadWrite.AppFolder"], redirect: vi.fn(), logout: vi.fn(), silent: vi.fn(), sso: vi.fn(), clear: vi.fn(), redirectResult: null as { account: { homeAccountId: string; username: string } } | null, redirectError: null as Error | null }));
vi.mock("@azure/msal-browser", () => ({
  InteractionRequiredAuthError: class extends Error {},
  PublicClientApplication: class {
    async initialize() {}
    loginRedirect(request: unknown) { return state.redirect(request); }
    logoutRedirect(request: unknown) { return state.logout(request); }
    clearCache(request: unknown) { return state.clear(request); }
    async handleRedirectPromise() { if (state.redirectError) throw state.redirectError; return state.redirectResult; }
    getActiveAccount() { return state.account; }
    getAllAccounts() { return state.account ? [state.account] : []; }
    setActiveAccount(account: typeof state.account) { state.account = account; }
    async ssoSilent(request: unknown) { return state.sso(request); }
    async acquireTokenSilent(request: unknown) { state.silent(request); return { scopes: state.scopes, accessToken: "test-access-token" }; }
  },
}));
it("requests explicit re-consent using only the existing app-folder scope", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  state.redirect.mockClear();
  try {
    const { signIn, reauthorizeOneDrive } = await import("../src/auth/microsoft");
    await signIn();
    await reauthorizeOneDrive();
    expect(state.redirect.mock.calls).toEqual([
      [{ scopes: ["Files.ReadWrite.AppFolder"] }],
      [{ scopes: ["Files.ReadWrite.AppFolder"], prompt: "consent" }],
    ]);
  } finally { vi.unstubAllEnvs(); }
});
it("does not let ordinary auth return a cached wide-file token", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  state.scopes = ["Files.ReadWrite", "Files.ReadWrite.AppFolder"];
  try { const { accessToken } = await import("../src/auth/microsoft"); await expect(accessToken()).rejects.toThrow("较宽的文件权限"); }
  finally { vi.unstubAllEnvs(); }
});
it("uses the remembered non-secret login hint for ordinary reconnect without select_account", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  const { LAST_MICROSOFT_LOGIN_HINT, signIn } = await import("../src/auth/microsoft");
  await setSetting(LAST_MICROSOFT_LOGIN_HINT, "a@example.test"); state.redirect.mockClear();
  try { await signIn(); expect(state.redirect).toHaveBeenCalledWith({ scopes: ["Files.ReadWrite.AppFolder"], loginHint: "a@example.test" }); }
  finally { vi.unstubAllEnvs(); }
});
it("restores a missing cached account with ssoSilent and remembers the account hint", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  const { LAST_MICROSOFT_LOGIN_HINT, recoverMicrosoftAccount } = await import("../src/auth/microsoft");
  state.account = null; state.sso.mockResolvedValueOnce({ account: { homeAccountId: "personal-a", username: "a@example.test" } });
  await setSetting(LAST_MICROSOFT_LOGIN_HINT, "a@example.test");
  try {
    await expect(recoverMicrosoftAccount({ online: true, visible: true })).resolves.toMatchObject({ username: "a@example.test" });
    expect(state.sso).toHaveBeenCalledWith({ scopes: ["Files.ReadWrite.AppFolder"], loginHint: "a@example.test" });
    expect(await getSetting(LAST_MICROSOFT_LOGIN_HINT)).toBe("a@example.test");
  } finally { state.account = { homeAccountId: "personal-a", username: "a@example.test" }; vi.unstubAllEnvs(); }
});
it("allows only one prompt=none recovery redirect and then requires manual reconnect", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  const { AUTO_REAUTH_ATTEMPTED, LAST_MICROSOFT_LOGIN_HINT, authRecoverySnapshot, recoverMicrosoftAccount } = await import("../src/auth/microsoft");
  state.account = null; state.sso.mockRejectedValueOnce(new (await import("@azure/msal-browser")).InteractionRequiredAuthError()); state.redirect.mockClear();
  await setSetting(LAST_MICROSOFT_LOGIN_HINT, "a@example.test"); sessionStorage.removeItem(AUTO_REAUTH_ATTEMPTED);
  try {
    await recoverMicrosoftAccount({ online: true, visible: true });
    expect(state.redirect).toHaveBeenCalledWith({ scopes: ["Files.ReadWrite.AppFolder"], loginHint: "a@example.test", prompt: "none" });
    await recoverMicrosoftAccount({ online: true, visible: true });
    expect(state.redirect).toHaveBeenCalledTimes(1); expect(authRecoverySnapshot()).toBe("needs-interactive-reauth");
  } finally { state.account = { homeAccountId: "personal-a", username: "a@example.test" }; sessionStorage.removeItem(AUTO_REAUTH_ATTEMPTED); vi.unstubAllEnvs(); }
});
it("clears a pending post-login connection when the user explicitly signs out", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  const { PENDING_ONE_DRIVE_CONNECT } = await import("../src/sync/pendingConnect");
  const { signOut } = await import("../src/auth/microsoft");
  await setSetting(PENDING_ONE_DRIVE_CONNECT, true);
  try {
    await signOut();
    expect(await getSetting(PENDING_ONE_DRIVE_CONNECT)).toBe(false);
    expect(await getSetting("lastMicrosoftLoginHint")).toBeUndefined();
  } finally { vi.unstubAllEnvs(); }
});

async function experimentTest(fn: () => Promise<void>) {
  const locks = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name: string, callback: () => Promise<unknown>) => callback() } });
  vi.stubEnv("DEV", true); vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  try { await fn(); }
  finally {
    log.mockRestore(); vi.unstubAllEnvs();
    if (locks) Object.defineProperty(navigator, "locks", locks); else Reflect.deleteProperty(navigator, "locks");
  }
}
it("isolates the one-shot wide experiment, cleans only its probe with If-Match, then retests fresh narrow auth", async () => experimentTest(async () => {
  await setSetting("syncEnabled", true);
  const db = await database(); await db.put("documents", { path: "local", data: { keep: true } });
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "root" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "own-probe", name: "__bookreader_probe.txt", file: {}, eTag: '"own-version"' }), { status: 201 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "root" })));
  try {
    await preparePermissionExperiment();
    expect(await getSetting("permissionExperimentPaused")).toBe(true); expect(await getSetting("syncEnabled")).toBe(false);
    await authorizeWideExperiment();
    expect(state.redirect).toHaveBeenLastCalledWith({ scopes: ["Files.ReadWrite"], prompt: "consent" });
    state.scopes = ["Files.ReadWrite", "Files.ReadWrite.AppFolder"];
    await runWideExperiment();
    await expect(runWideExperiment()).rejects.toThrow("只允许执行一次");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[0][0])).toBe("https://graph.microsoft.com/v1.0/me/drive/special/approot");
    expect(String(fetch.mock.calls[1][0])).toContain("__bookreader_probe.txt:/content?@microsoft.graph.conflictBehavior=fail");
    await expect(authorizeNarrowRetest()).rejects.toThrow("先清理");
    await cleanupExperimentProbe();
    expect(fetch.mock.calls[2]).toEqual(["https://graph.microsoft.com/v1.0/me/drive/items/own-probe", expect.objectContaining({ method: "DELETE", headers: expect.objectContaining({ "If-Match": '"own-version"' }) })]);
    await authorizeNarrowRetest();
    expect(state.clear).toHaveBeenLastCalledWith({ account: state.account });
    expect(state.redirect).toHaveBeenLastCalledWith({ scopes: ["Files.ReadWrite.AppFolder"], prompt: "consent" });
    await expect(runNarrowRetest()).rejects.toThrow("范围不符合"); // Still-wide metadata cannot become a false positive.
    expect(fetch).toHaveBeenCalledTimes(3);
    state.scopes = ["Files.ReadWrite.AppFolder"];
    await runNarrowRetest();
    expect(state.silent).toHaveBeenLastCalledWith({ scopes: ["Files.ReadWrite.AppFolder"], account: state.account, forceRefresh: true });
    expect(await getSetting("permissionExperimentPaused")).toBe(true);
    await finishPermissionExperiment();
    expect(fetch).toHaveBeenCalledTimes(4); expect(await getSetting("permissionExperimentPaused")).toBe(false);
    await expect(preparePermissionExperiment()).rejects.toThrow("已经准备过");
    expect(await getSetting("permissionExperimentPaused")).toBe(false);
    expect(await getSetting("syncEnabled")).toBe(false); expect(await db.get("documents", "local")).toEqual({ path: "local", data: { keep: true } });
    expect(JSON.stringify(await readPermissionExperiment())).not.toContain("test-access-token");
  } finally { fetch.mockRestore(); }
}));
it.each([403, 409])("never deletes an uncreated or existing probe after PUT %s", async (status) => experimentTest(async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}"))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "accessDenied" } }), { status }));
  try {
    await preparePermissionExperiment(); await authorizeWideExperiment(); state.scopes = ["Files.ReadWrite"];
    await expect(runWideExperiment()).rejects.toThrow(`HTTP ${status}`);
    await expect(cleanupExperimentProbe()).rejects.toThrow("没有可安全自动清理");
    expect(fetch).toHaveBeenCalledTimes(2); expect(await getSetting("permissionExperimentPaused")).toBe(true);
  } finally { fetch.mockRestore(); }
}));
it("retains the safety lock and cleanup requirement if a PUT response is lost", async () => experimentTest(async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}")).mockRejectedValueOnce(new TypeError("network failed"));
  try {
    await preparePermissionExperiment(); await authorizeWideExperiment(); state.scopes = ["Files.ReadWrite"];
    await expect(runWideExperiment()).rejects.toThrow("network failed");
    expect((await readPermissionExperiment())?.cleanupUncertain).toBe(true);
    await expect(runWideExperiment()).rejects.toThrow("只允许执行一次");
    await expect(authorizeNarrowRetest()).rejects.toThrow("先清理");
    await expect(finishPermissionExperiment()).rejects.toThrow("继续锁定");
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally { fetch.mockRestore(); }
}));
it("rejects the permission experiment in production before changing settings", async () => {
  vi.stubEnv("DEV", false);
  try { await expect(preparePermissionExperiment()).rejects.toThrow("仅限开发环境"); expect(await getSetting("permissionExperimentPaused")).toBeUndefined(); }
  finally { vi.unstubAllEnvs(); }
});
it("does not unlock sync if the narrow-only Graph retest still returns 403", async () => experimentTest(async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "accessDenied" } }), { status: 403 }));
  try {
    await preparePermissionExperiment(); await authorizeNarrowRetest(); state.scopes = ["Files.ReadWrite.AppFolder"];
    await expect(runNarrowRetest()).rejects.toThrow("HTTP 403");
    await expect(finishPermissionExperiment()).rejects.toThrow("继续锁定");
    expect(await getSetting("permissionExperimentPaused")).toBe(true); expect(fetch).toHaveBeenCalledTimes(1);
  } finally { fetch.mockRestore(); }
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
it("keeps User.Read restricted to explicit diagnostics and validates both granted scopes", async () => {
  vi.stubEnv("VITE_MS_CLIENT_ID", "10000000-0000-4000-8000-000000000001");
  try {
    const { authorizeGraphDiagnostics, diagnosticAccessToken } = await import("../src/auth/microsoft");
    await authorizeGraphDiagnostics();
    expect(state.redirect).toHaveBeenLastCalledWith({ scopes: ["User.Read", "Files.ReadWrite.AppFolder"], prompt: "consent" });
    state.scopes = ["Files.ReadWrite.AppFolder"];
    await expect(diagnosticAccessToken()).rejects.toThrow("诊断需要 User.Read");
    state.scopes = ["https://graph.microsoft.com/User.Read", "Files.ReadWrite.AppFolder"];
    await expect(diagnosticAccessToken()).resolves.toBe("test-access-token");
    expect(state.silent).toHaveBeenLastCalledWith({ scopes: ["User.Read", "Files.ReadWrite.AppFolder"], account: state.account });
  } finally { vi.unstubAllEnvs(); }
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
