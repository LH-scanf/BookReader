import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDir = fileURLToPath(new URL("../dist/assets/", import.meta.url));
const appBundles = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js") && !name.startsWith("epub-"))
  .map((name) => readFileSync(join(assetsDir, name), "utf8"))
  .join("\n");

if (appBundles.includes("epubIframeDiagnostic")) {
  throw new Error("Production bundle still contains the EPUB iframe URL diagnostic switch");
}

const scriptOptions = [...appBundles.matchAll(/\ballowScriptedContent\s*:\s*([^,}\s]+)/g)]
  .map((match) => match[1]);
if (scriptOptions.length !== 1 || !["false", "!1"].includes(scriptOptions[0])) {
  throw new Error(`EPUB script permission must be explicitly false in the app bundle; found ${JSON.stringify(scriptOptions)}`);
}

console.log("Production EPUB sandbox verified: no URL switch and scripts explicitly disabled.");
