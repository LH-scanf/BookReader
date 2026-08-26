import "fake-indexeddb/auto";
import { Blob, File } from "node:buffer";
import { beforeEach, vi } from "vitest";
import { database } from "../src/storage/database";

vi.stubGlobal("Blob", Blob);
vi.stubGlobal("File", File);
vi.stubGlobal("BroadcastChannel", undefined);
beforeEach(async () => {
  const db = await database();
  for (const store of ["documents", "files", "queue", "settings", "remote"] as const) await db.clear(store);
});
