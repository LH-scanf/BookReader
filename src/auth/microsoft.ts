import { InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";
import { database } from "../storage/database";

const scopes = ["Files.ReadWrite.AppFolder"];
const diagnosticScopes = ["User.Read", ...scopes];
export const authConfigured = () => /^[0-9a-f-]{36}$/i.test(import.meta.env.VITE_MS_CLIENT_ID ?? "");
let clientPromise: Promise<PublicClientApplication> | undefined;
export function microsoftClient() {
  if (!authConfigured()) throw new Error("尚未配置微软应用 Client ID；本地阅读仍可使用");
  return clientPromise ??= (async () => {
    const client = new PublicClientApplication({
      auth: { clientId: import.meta.env.VITE_MS_CLIENT_ID, authority: "https://login.microsoftonline.com/consumers",
        redirectUri: `${location.origin}/`, navigateToLoginRequestUrl: false },
      cache: { cacheLocation: "localStorage" },
    });
    await client.initialize();
    const result = await client.handleRedirectPromise();
    if (result?.account) client.setActiveAccount(result.account);
    return client;
  })();
}
export async function accountInfo() {
  if (!authConfigured()) return null;
  const client = await microsoftClient();
  return client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;
}
export async function requireAccount() {
  const account = await accountInfo();
  if (!account) throw new Error("请先登录微软账号");
  const tx = (await database()).transaction("settings", "readwrite");
  const bound = await tx.store.get("boundAccount");
  if (bound && bound !== account.homeAccountId) {
    await tx.done;
    throw new Error("本机书库绑定了另一个微软账号。为防止串号上传，请登录原账号；切换账号需另行备份并清理站点数据");
  }
  // A single local library is deliberately pinned; sign-out never silently rebinds it.
  if (!bound) await tx.store.put(account.homeAccountId, "boundAccount");
  await tx.done;
  return account;
}
export async function signIn() { await (await microsoftClient()).loginRedirect({ scopes, prompt: "select_account" }); }
// Explicit user action: ask for consent again without widening access or clearing local data.
export async function reauthorizeOneDrive() { await (await microsoftClient()).loginRedirect({ scopes, prompt: "consent" }); }
export async function authorizeGraphDiagnostics() {
  await (await microsoftClient()).loginRedirect({ scopes: diagnosticScopes, prompt: "consent" });
}
export async function signOut() {
  const account = await accountInfo();
  await (await microsoftClient()).logoutRedirect({ account, postLogoutRedirectUri: `${location.origin}/` });
}
export async function accessToken() { return tokenFor(scopes); }
export async function diagnosticAccessToken() { return tokenFor(diagnosticScopes); }
async function tokenFor(requestedScopes: string[]) {
  const client = await microsoftClient(); const account = await requireAccount();
  try {
    const result = await client.acquireTokenSilent({ scopes: requestedScopes, account });
    // Inspect MSAL's scope metadata, never decode, log or expose the bearer token.
    if (!result.scopes.some((scope) => scope.toLowerCase().replace(/^https:\/\/graph\.microsoft\.com\//, "") === "files.readwrite.appfolder")) {
      throw new Error("当前授权未包含 Files.ReadWrite.AppFolder。请在微软应用中检查委托权限，并在本应用点击重新授权 OneDrive；无需扩大为全盘权限");
    }
    if (requestedScopes.includes("User.Read") && !result.scopes.some((scope) =>
      scope.toLowerCase().replace(/^https:\/\/graph\.microsoft\.com\//, "") === "user.read")) {
      throw new Error("诊断需要 User.Read，请点击“授权身份对照诊断”；OneDrive 文件权限仍仅为 AppFolder");
    }
    return result.accessToken;
  }
  catch (error) {
    if (error instanceof InteractionRequiredAuthError) throw new Error(requestedScopes.includes("User.Read")
      ? "诊断需要交互授权，请点击“授权身份对照诊断”；本机数据已保留"
      : "微软登录已过期，请点击登录重新授权；本机待上传数据已保留");
    throw error;
  }
}
