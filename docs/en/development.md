# Development

## 1. Requirements

- Node.js ≥ 22.19 (for building and checks; the runtime comes from Harness).
- A working DeepSeek Harness install (`>=0.2.1-rc.5`), ideally with two profiles:
  - a production one (e.g. `desktop`) with a released build;
  - a development one (e.g. `yanfield-dev`) linked to this checkout through the DSH CLI.

```bash
npm ci
```

Build dependencies only (esbuild, Tailwind CLI, React types). Published packages ship `dist/`, and installing never runs lifecycle scripts.

## 2. Commands

| Command | What it does |
| --- | --- |
| `npm run build` | generate routes → compile CSS → bundle `dist/host.js`, `dist/client.js` |
| `npm run check` | manifest checks: name, `cordis.patch.yml`, exports, README install command, artefacts |
| `npm run smoke` | smoke test: boots the HTTP handler in a temp dir and exercises key endpoints |
| `npm run test` | build + check + smoke |
| `npm pack --dry-run` | check that the package contains both `dist/` entry points and `cordis.patch.yml` |
| `npm run reinstall -- <profile>` | replace an existing copied install for debugging. Use the DSH CLI for the first install |

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

1. Build from the repository root, create a profile from the Web template and link the checkout:

   ```bash
   npm test
   dsh --profile yanfield-dev --from-default-profile web --dump-config
   dsh plugin --profile yanfield-dev add .
   ```

   `--from-default-profile` recreates the named profile. Run that line only when creating it.

2. Give that profile an isolated database in `~/.dsh/profiles/yanfield-dev/cordis.patch.yml`:

   ```yaml
   - id: yanfield
     config:
       dataDir: D:/dsh-yanfield/.tmp-test/dataA
   ```

   The `id` is the plugin id inside the package (`yanfield`), not the package name.

3. Start it:

   ```bash
   dsh --profile yanfield-dev --port 4761 --no-open
   ```

   The log prints a URL with a token; open it in a headless browser for automation.

4. Run `npm run build` and restart the dev instance after changing runtime code. The profile remains linked to the checkout.

## 6. Visual verification (optional)

The repo does not depend on browser automation, but a headless Chrome screenshot is handy:

```bash
chrome --headless=new --no-sandbox --disable-gpu --disable-crash-reporter \
  --user-data-dir=.tmp-test/profile --hide-scrollbars \
  --window-size=1400,950 --screenshot=out.png "http://127.0.0.1:4761/?token=<token>"
```

For interaction (clicks, waiting on streaming output) drive CDP directly: connect to the `webSocketDebuggerUrl` from `/json/version` and send `Runtime.evaluate` / `Input.dispatchMouseEvent`.

## 7. Release checklist

Branch pushes and PRs run CI. Bump the version in the PR itself (never on `main` after the fact):

```bash
npm version patch --no-git-tag-version   # updates package.json and the lockfile only
```

Merge the PR first, then tag the merged commit:

```bash
git checkout main
git pull origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

Pushing the tag is what triggers the [release workflow](../../.github/workflows/release.yml): it checks that the tag matches the package version, then builds, tests, and packs once. **A PR merge alone does not publish.** GitHub Releases and npm receive the same `dsh-yanfield.tgz`. Stable npm versions use `latest`, and prereleases use `next`.

The npm Trusted Publisher binds `release.yml` in `ZzimaR/dsh-yanfield` and permits `npm publish`. The workflow authenticates with OIDC. Test the package in an isolated profile by creating a novel, connecting a model, and reviewing an AI edit.

Builds generate `dist/` and ship it in the archive. Developers link the checkout. The catalog entry uses [market-entry.yml](../market-entry.yml), while [screenshots.json](../../screenshots.json) provides gallery images. The market links npm using the manifest's `repository` field.

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
