// Build script for emdash-plugin-engagement.
//
// Produces the publishable dist/ artifacts:
//   - dist/index.mjs          (standard-format descriptor entry, "." export)
//   - dist/sandbox-entry.mjs  (sandboxed runtime: hooks + routes, "./sandbox" export)
//
// dist/ is gitignored and rebuilt here, so this file is the single source of
// truth for the published bundle. Sandboxed plugins must resolve to prebuilt
// JS — the isolate loader cannot transpile TS on the fly like a site's own
// Vite dev server can for the astro.config-side "." import.
//
// src/astro/*.astro stays unbundled — those are consumed by the installing
// site's own Astro/Vite build, not loaded into the sandbox isolate.

import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

const outdir = "dist";

await mkdir(outdir, { recursive: true });

await build({
	entryPoints: ["src/index.ts", "src/sandbox-entry.ts"],
	outdir,
	outExtension: { ".js": ".mjs" },
	format: "esm",
	platform: "neutral",
	target: "es2022",
	bundle: true,
	// emdash is provided by the host at runtime — never bundle it.
	external: ["emdash", "emdash/*"],
});

console.log("[emdash-plugin-engagement] build complete → dist/");
