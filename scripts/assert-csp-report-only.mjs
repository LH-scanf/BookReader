import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sourceHeaders = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const builtHeaders = readFileSync(new URL("../dist/_headers", import.meta.url), "utf8");
const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");

if (builtHeaders !== sourceHeaders) throw new Error("Cloudflare Pages _headers was not copied into the Web build");
if (!/^\/\*\s*$/m.test(builtHeaders)) throw new Error("CSP header must match the Pages HTML route");
if (/^\s*Content-Security-Policy\s*:/mi.test(builtHeaders)) throw new Error("Enforcing CSP is outside this stage");

const policies = [...builtHeaders.matchAll(/^\s*Content-Security-Policy-Report-Only:\s*(.+)$/gmi)];
if (policies.length !== 1) throw new Error("Expected one Report-Only CSP header");
if (policies[0][0].length > 2000) throw new Error("Cloudflare Pages _headers line exceeds 2,000 characters");
const policy = policies[0][1];
const directives = new Map(policy.split(";").map((part) => part.trim().split(/\s+/, 2)));
for (const name of ["default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "frame-src", "worker-src", "frame-ancestors"]) {
  if (!directives.has(name)) throw new Error(`Missing CSP directive: ${name}`);
}
if (/\bunsafe-eval\b/.test(policy) || /script-src[^;]*'unsafe-inline'/.test(policy)) {
  throw new Error("Scripts must not use unsafe-eval or unsafe-inline");
}

const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
if (inlineScripts.length !== 1) throw new Error(`Expected one known inline bootstrap script; found ${inlineScripts.length}`);
const hash = createHash("sha256").update(inlineScripts[0][1]).digest("base64");
if (!policy.includes(`'sha256-${hash}'`)) throw new Error("CSP script hash does not match the built HTML");

console.log("Web CSP Report-Only verified: Pages output, non-enforcing header and inline script hash.");
