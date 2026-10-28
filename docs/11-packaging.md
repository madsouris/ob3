# 11 — Packaging & Distribution

Milestone: **M0** (pipeline) / **M7** (release) · Spec: `brief.md` §10 · Code: `package.json`, `vite.config.ts`, `scripts/`

## Purpose

Ship one npm package that runs instantly via `npx` on macOS, Linux, and Windows with no compiler, no postinstall step, and no runtime build.

## Package layout

```
dist/
├── cli/index.js         # shebang + compiled ESM entry
├── server/…             # compiled backend
├── client/index.html    # single-file SPA (JS + CSS inlined)
├── shared/…             # cents helpers shared by server & client
└── demo/                # canonical demo workspace, copied from fixtures/ at build
fixtures/
└── workspaces/demo/     # source of truth for demo data (repo only, not published)
docs/
README.md
LICENSE
package.json
```

`files` allowlist: `dist`, `docs`, `README.md`, `LICENSE`. `src/` and `fixtures/` are never published; the demo workspace reaches users as `dist/demo`.

## `package.json` essentials

```json
{
  "name": "@operationbegin/crm",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "bin": { "ob": "dist/cli/index.js", "filecrm": "dist/cli/index.js" },
  "files": ["dist", "docs", "README.md", "LICENSE"],
  "dependencies": { "hono": "…", "@hono/node-server": "…", "chokidar": "…", "yaml": "…", "zod": "…", "flexsearch": "…" },
  "scripts": {
    "build": "npm run build:client && npm run build:server && node scripts/postbuild.mjs",
    "build:client": "vite build",
    "build:server": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "prepublishOnly": "npm run typecheck && npm run test && npm run build"
  }
}
```

Rules:

* `chokidar`'s `fsevents` stays an **optional** dependency of chokidar; we never add it directly and never require it.
* No `postinstall` script. `npx` must never compile anything.
* React/Tailwind/shadcn are `devDependencies` (bundled into `index.html`), keeping the install tree small.
* `prepublishOnly` blocks a publish with failing types or tests.

## Build pipeline

1. **Client:** `vite build` with `vite-plugin-singlefile` → `dist/client/index.html`. Verify no `src=`/`href=` points outside the file (except `data:`).
2. **Server:** `tsc` → `dist/server`, `dist/cli/index.js` (rootDir `src`, outDir `dist`).
3. **Postbuild** (`scripts/postbuild.mjs`):
   * copy `fixtures/workspaces/demo/` → `dist/demo/` (fail if `.ob/config.json` is missing)
   * prepend `#!/usr/bin/env node` to `dist/cli/index.js` and `chmod 755`
   * fail if `dist/client/index.html` is missing or references an external asset
   * fail if any `dist/` file imports `js-yaml` (ADR-04)

## Runtime asset resolution

`dist/cli/index.js` locates the SPA via `new URL('../client/index.html', import.meta.url)` — no `__dirname`, no cwd assumption, works when the package is installed globally, via `npx`, or from a tarball.

## Verification (must pass before publish)

| Check | How |
|---|---|
| No native modules | `npm pack`, install in a temp dir with `--ignore-scripts`, assert no `.node` files and no `node-gyp` in the output |
| Polling fallback | run with `CHOKIDAR_USEPOLLING=1` and complete a CRUD cycle |
| Cross-platform | CI matrix: `ubuntu-latest`, `macos-latest`, `windows-latest` × Node 20/22 |
| Tarball smoke test | extract tarball → `node dist/cli/index.js --help` → init demo in a temp dir → `GET /api/health` → Ctrl+C |
| Global alias | `npm i -g ./pkg.tgz` → `ob --version` and `filecrm --version` |
| Bundle size | `dist/client/index.html` < 800 KB (warn only) |
| Demo shipped | `dist/demo/.ob/config.json` exists and `dist/demo` holds 13 records |
| Publish dry run | `npm publish --dry-run` and review the file list |

## Versioning

* Semver. Frontmatter schema changes bump `ob_schema` and require a documented migration path; `ob` must read older `ob_schema` values indefinitely (never silently upgrade files).
* `ob --version` prints the package version **and** the `ob_schema` generation.

## Out of scope for v1

* Homebrew/`winget`/standalone binaries
* Docker image
* Auto-update mechanism (npm owns updates)

## Acceptance criteria

- [ ] A machine with only Node 20 + Git runs the tarball via `npx` and completes a full CRUD + sync cycle.
- [ ] No native compilation occurs; `node-gyp` is never invoked.
- [ ] `npm publish --dry-run` lists only `dist/`, `docs/`, `README.md`, `LICENSE`, `package.json`.
- [ ] Both `ob` and `filecrm` resolve after a global install.
