import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const outputDirectory = fileURLToPath(new URL("../dist-desktop/", import.meta.url));
const forbiddenSignatures = [
  "@azure/msal-browser",
  "PublicClientApplication",
  "login.microsoftonline.com/consumers",
  "graph.microsoft.com/v1.0",
  "bookreader-sync",
  "bookreader-auto-reauth-attempted",
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? files(join(directory, entry.name))
    : [join(directory, entry.name)]));
  return nested.flat();
}

const assets = await files(outputDirectory);
const contents = await Promise.all(assets.map(async (file) => [file, await readFile(file, "utf8").catch(() => "")]));
const leaked = forbiddenSignatures.filter((signature) => contents.some(([, content]) => content.includes(signature)));

if (leaked.length) {
  throw new Error(`Desktop bundle unexpectedly contains Web-only sync/auth signatures: ${leaked.join(", ")}`);
}

console.log("Desktop bundle isolation verified: no Web-only sync/auth signatures found.");
