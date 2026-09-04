import { describe, expect, it } from "vitest";
import { resolveMobileSyncState } from "../src/mobile/MobileSettingsView";

const idle = { phase: "idle" as const, message: "已同步" };

describe("mobile settings sync status", () => {
  it("maps connected, syncing, offline, authorization and disconnected states to product labels", () => {
    expect(resolveMobileSyncState({ online: true, account: true, connected: true, status: idle, lastSyncAt: "2026-09-04T00:00:00Z" })).toMatchObject({ kind: "connected", label: "已连接" });
    expect(resolveMobileSyncState({ online: true, account: true, connected: true, status: { phase: "syncing", message: "" }, lastSyncAt: "" })).toMatchObject({ kind: "syncing", label: "正在同步" });
    expect(resolveMobileSyncState({ online: false, account: true, connected: true, status: idle, lastSyncAt: "" })).toMatchObject({ kind: "offline", label: "离线" });
    expect(resolveMobileSyncState({ online: true, account: true, connected: true, status: { phase: "error", message: "", requiresAction: true }, lastSyncAt: "" })).toMatchObject({ kind: "reconnect", label: "需要重新连接" });
    expect(resolveMobileSyncState({ online: true, account: false, connected: false, status: idle, lastSyncAt: "" })).toMatchObject({ kind: "disconnected", label: "未连接" });
  });
});
