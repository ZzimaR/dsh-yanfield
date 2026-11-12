# Development

## 1. Requirements

- Node.js ≥ 22.19 (for building and checks; the runtime comes from Harness).
- A working DeepSeek Harness install (`>=0.2.1-rc.5 <0.3.0`), ideally with two profiles:
  - a production one (e.g. `desktop`) with a released build;
  - a development one (e.g. `yanfield-dev`) whose plugin dependency is `link:`-ed to this repo.

```bash
npm install
```

Build dependencies only (esbuild, Tailwind CLI, React types). Published packages ship `dist/`, and installing never runs lifecycle scripts.

## 2. Commands

| Command | What it does |
| --- | --- |
| `npm run build` | generate routes → compile CSS → bundle `dist/host.js`, `dist/client.js` |
| `npm run check` | manifest checks: name, `cordis.patch.yml`, exports, README install command, artefacts |
| `npm run smoke` | smoke test: boots the HTTP handler in a temp dir and exercises key endpoints |
| `npm run test` | build + check + smoke |
| `npm run reinstall` | build + check + replace `~/.dsh/profiles/<profile>/node_modules/dsh-yanfield` wholesale |

`reinstall` defaults to `desktop`; pass a profile name for another one:

```bash
npm run reinstall -- yanfield-dev
```

> A desktop profile holds a **real copy** (not a symlink), so every host-side change needs reinstall + restart. A dev profile using `link:` only needs a restart.

## 3. Build chain

`scripts/build.mjs` does four things:

1. **Routes**: scan `vendor/yanfield/app/api/**/route.ts` and emit `src/generated/routes.js` (`{ path: { GET, POST, … } }`). Generated, git-ignored.
2. **Styles**: `client/app.css` imports Tailwind, `@source`s `vendor/yanfield`, then imports the vendored `globals.css`; `@tailwindcss/cli --minify` writes `client/styles.generated.css` and the module CSS is appended.
3. **Browser bundle**: esbuild `client/index.tsx` → `dist/client.js` (CJS, `platform=browser`, React external, `.css` as text loader, banner `window.__ModuleLoader__.load(...)`). The build stamp is injected via `define.__YANFIELD_BUILD__` and shown in Settings → About.
4. **Host bundle**: esbuild `src/host.ts` → `dist/host.js` (ESM, node22).

The alias `@/` → `vendor/yanfield/` keeps vendored imports untouched.

## 4. Two traps

**1. Do not drag server modules into the browser bundle.**
When exporting helpers used by client components, check the module's imports. A helper living next to `repo` (`node:sqlite`) makes esbuild fail with `Could not resolve "node:sqlite"`. Keep pure helpers in dependency-free modules (for example `lib/ai/harness-bridge.ts`).

**2. Always write LF from scripts.**
When patching sources with Python, use `io.open(path, "w", encoding="utf-8", newline="\n")`; otherwise the whole file flips to CRLF and the diff explodes.

## 5. Local development instance

Run a separate instance so you never touch the profile you actually use.

1. Create `~/.dsh/profiles/yanfield-dev` and link the plugin:

   ```json
   { "dependencies": { "dsh-yanfield": "link:D:/dsh-yanfield" } }
   ```

2. Give that profile an isolated database in `~/.dsh/profiles/yanfield-dev/cordis.patch.yml`:

   ```yaml
   - id: yanfield
     config:
       dataDir: D:/dsh-yanfield/.tmp-test/dataA
   ```

   The `id` is the plugin id inside the package (`yanfield`), not the package name.

3. Start it:

   ```bash
   "<install>/DeepSeek Harness.exe" --expose-internals "<install>/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js" \
     --profile yanfield-dev --port 4761 --no-open
   ```

   The log prints a URL with a token; open it in a headless browser for automation.

4. Client changes: rebuild and refresh (assets carry a content hash). Host changes: restart the instance.

## 6. Visual verification (optional)

The repo does not depend on browser automation, but a headless Chrome screenshot is handy:

```bash
chrome --headless=new --no-sandbox --disable-gpu --disable-crash-reporter \
  --user-data-dir=.tmp-test/profile --hide-scrollbars \
  --window-size=1400,950 --screenshot=out.png "http://127.0.0.1:4761/?token=<token>"
```

For interaction (clicks, waiting on streaming output) drive CDP directly: connect to the `webSocketDebuggerUrl` from `/json/version` and send `Runtime.evaluate` / `Input.dispatchMouseEvent`.

## 7. Release checklist

1. `npm run test` is green;
2. `npm run build` refreshed `dist/` and `client/styles.generated.css`;
3. the install command in `README.md` matches `package.json` (`name`, `dsh` fields);
4. the version in `package.json` matches Settings → About;
5. install into a clean profile once: install → restart → new novel → send a message → review and apply;
6. commit `dist/` together with sources (installs never build).

## 8. Layout

```
client/            plugin half: shadow DOM mount, slot registration, styles
src/host.ts        host half: /yanfield routes, model and account bridge
scripts/           build / check / smoke / reinstall
vendor/yanfield/
  app/             pages and API routes (Next-style, reused inside the plugin)
  components/      UI: editor / ai / library / settings / ui(kit)
  lib/             domain types, SQLite, repo, AI provider / agent / diff
docs/              features, AI and cost, architecture, development, FAQ, screenshots
```
