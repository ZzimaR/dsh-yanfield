# AGENTS.md

Instructions for AI coding agents working on **Yanfield / dsh-yanfield**. Read this file before changing anything. If a request conflicts with these rules, stop and ask the repository owner.

## 1. What this project is

Yanfield is a **DeepSeek Harness (DSH) plugin**, not a standalone web app. It adds a long-form fiction writing desk to the Harness sidebar: a shelf of books, a three-column editor (contents · prose · AI assistant), outlines, character/world/foreshadowing notes, story archives, and an AI assistant whose prose and note changes are reviewed before they are written.

The product is **bilingual (Simplified Chinese and English)**. The UI follows the DSH language setting (`Settings → General → Language`); the sidebar entry is 「砚田」 in Chinese and **Yanfield** in English. Manuscripts, book titles, chapter titles, and other author content are never translated. The AI replies in the language the author writes in.

Data is local-first: a SQLite database stores books, notes, conversations, AI runs, and settings. The model comes from the DeepSeek service already configured in Harness, so the plugin does not manage a second API key.

## 2. Repository structure

```
client/                 Browser half: Shadow DOM mount, slot registration, CSS entry
  index.tsx             Attaches the shadow root, injects CSS, mounts React, registers slots
  app.tsx               Root React tree: toast/save-guard providers, page routing
  app.css               Tailwind entry + generated styles import
src/
  host.ts               Host half: plugin manifest, /yanfield router, model/account bridge
  http.ts               HTTP plumbing: auth, JSON, errors, SSE
  generated/routes.js   Generated route table (git-ignored, do not edit)
vendor/yanfield/
  app/                  Next.js-style pages and API route files
    api/**/route.ts     GET/POST/PATCH/DELETE handlers, discovered at build time
    library/            Shelf page
    novel/[novelId]/    Book overview
    editor/[novelId]/   Three-column editor
    settings/           Settings page
  components/           UI by domain: ai, editor, library, outline, cards, archives,
                        settings, layout, ui (shared kit), brand, diff, landing, home
  lib/                  Domain logic; no JSX except a few helpers
    ai/                 Agent loop, prompts, providers, presets, cost, errors
    db/                 SQLite schema and repositories
    i18n/               Runtime + English dictionaries (see §5.4)
    client/api.ts       Browser API client (REST + SSE, ApiError)
    types.ts            Shared domain types
    defaults.ts         Built-in presets, demo data, provider defaults
    seed.ts             Demo books
scripts/                build.mjs, check.mjs, check-i18n.mjs, smoke.mjs, reinstall.mjs
locale/{en,zh}.json     Plugin-market metadata (title/description)
docs/                   Chinese docs; docs/en/ English docs; docs/screenshots/
dist/                   Build output (git-ignored, never edit by hand)
cordis.patch.yml        DSH composition patch (plugin id: yanfield)
```

Path alias: `@/` means `vendor/yanfield/`. Keep vendored imports unchanged.

## 3. How it runs

- **Browser half** (`client/index.tsx`): attaches an open Shadow DOM to the host element, injects compiled CSS, mounts React, and registers the `main`, `sidebar.panellist`, and right-pane tab slots. Menus, dialogs, and toasts render into a portal inside the shadow root. Clicks outside overlays use `composedPath()` because Shadow DOM retargets `event.target`.
- **Host half** (`src/host.ts`): exports `{ name, apply }`; mounts `/yanfield/*` on the DSH `webServer`, reuses Harness session auth, and bridges models/account lazily via `ctx.inject(["llm"], …)`.
- **Routes**: `vendor/yanfield/app/api/**/route.ts` are scanned by `scripts/build.mjs` into `src/generated/routes.js` (about 48 routes). `src/http.ts` dispatches to them.
- **Database**: SQLite, default `$DSH_HOME/yanfield/yanfield.db` (override with `YANFIELD_DB_PATH` or the plugin `dataDir` config). The database is the source of truth; the UI does not keep a separate draft copy.
- **AI flow**: SSE endpoint → `runAgent` decision loop (max 12 rounds) → read notes / propose changes → candidates streamed to the UI → the author keeps or reverts each prose block or note change. Accepted changes are written by explicit API calls.

## 4. Build, test, and local development

Requirements: Node.js ≥ 22.19 and a DSH install ≥ 0.2.1-rc.5.

```bash
npm ci
npm run build      # routes → CSS → dist/host.js + dist/client.js
npm run check      # manifest, README commands, artefacts, i18n dictionaries
npm run smoke      # boots the host handler in a temp dir and exercises endpoints
npm test           # build + check + smoke (use this before handing work back)
```

- `npm run build` writes `src/generated/routes.js`, `client/styles.generated.css`, and `dist/`. These are generated; never edit or commit them.
- The DSH dev server caches the loaded client bundle. After `npm run build`, restart the dev instance and disable the browser cache before judging UI changes.
- `npm run check-i18n.mjs` is part of `npm run check`. It fails on missing English entries and duplicate keys in one dictionary file.
- When patching files with Python, always write `newline="\n"`. Python text mode otherwise flips files to CRLF and creates huge diffs.
- Keep pure helpers free of `node:sqlite`/server imports, or the browser bundle fails with `Could not resolve "node:sqlite"`.

## 5. Engineering rules

### 5.1 TypeScript and React

- Match the surrounding style: TypeScript, two-space indentation, double quotes, no semicolons, `function` declarations for components where the file does so.
- Client components start with `"use client"`. Server-only code must not leak into the browser bundle.
- Use the shared primitives in `vendor/yanfield/components/ui/kit.tsx` (Button, IconButton, Dialog, Sheet, Select, Toast, ConfirmDialog, Spinner, Tooltip) instead of ad-hoc overlays.
- Keep components accessible: every icon-only control needs an `aria-label`, every dialog a title, every destructive action a confirmation.
- Do not rename domain fields or database columns casually; they cross the host/client boundary and existing databases.

### 5.2 Styling and Shadow DOM

- Use the existing design tokens and Tailwind utilities (`text-ink`, `bg-surface`, `border-line`, `text-ink-2`, …). Do not introduce raw hex colors or a second styling system.
- The whole UI lives in a shadow root. Do not rely on `document.body` for layout, and do not attach global listeners that assume light-DOM targets.
- Menus/dialogs/toasts must render into the existing `.yf-portal` container; fixed overlays are positioned from the panel bounds.
- Test both themes (rice paper / night sail) and both narrow (≈860 px) and desktop (≈1440 px) widths when touching layout.

### 5.3 Data and HTTP

- Put SQL in `vendor/yanfield/lib/db/` repositories, not in components or route files.
- Route handlers return JSON and throw `ApiError` / `notFound()` / `bad()`; `src/http.ts` wraps them into `{ error }`.
- Server error strings are Chinese source strings today. When you add one, also add an English entry in `lib/i18n/en/server.ts`; the client translates at display time (`parseResponse` → `t(message)`). Use `{name}` placeholders, not string concatenation.
- Never expose secrets, API keys, or absolute user paths in errors, logs, or telemetry.
- Long-running AI work streams over SSE; keep cancellation and cleanup paths intact.

### 5.4 Internationalization (highest priority)

Every user-visible string must exist in both languages.

- **Dictionary keys are the Chinese source strings.** English values live in `vendor/yanfield/lib/i18n/en/<domain>.ts` (`common`, `library`, `editor`, `ai`, `settings`, `cards`, `outline`, `archives`, `landing`, `presets`, `server`). `en.ts` merges them; a later module overrides an earlier one, so do not duplicate a key across domains without checking `node scripts/check-i18n.mjs`.
- In React: `import { useT } from "@/lib/i18n"`, then `const tr = useT()` at the top of the component and `tr("中文原文")` in JSX. Call `tr` during render.
- Outside React (helpers, API client): `import { t } from "@/lib/i18n/core"` and call `t("中文原文")` at the call site. **Never call `t()` at module top level** — it freezes the language at import time.
- Module-level constants (nav items, sort options, help text) keep their Chinese `label`; translate when rendering: `tr(item.label)`.
- Interpolate with named placeholders: `tr("共 {count} 部作品", { count })`. English and Chinese must use the same placeholder names. For plurals use a dictionary value `{ one, other }` and pass `count` (or `n`).
- Do not translate author content: book/volume/chapter titles, manuscript prose, character names, demo manuscripts, or user-entered text. The bundled sample books are Chinese demos by design.
- Verify both directions: switch DSH to English and Chinese, reload, and check the sidebar entry, shelf, overview, editor chrome, AI panel, settings, dialogs, toasts, and empty states. English chrome must contain no CJK except author content and the brand name 「砚田」 where the Chinese name is intentional.

### 5.5 AI prompts and presets

- Built-in presets have Chinese names and Chinese prompt bodies in `lib/defaults.ts`; English prompt bodies live in `lib/ai/preset-en.ts`, keyed by the exact Chinese preset name. Keep placeholder sets identical between the two (`{{novelTitle}}`, `{{context}}`, `{{message}}`, `{{words}}`, …).
- `resolvePreset(..., locale)` selects the English body when the request locale is `en`; the browser sends `locale` from `getYanfieldLocale()`.
- Every system prompt gets a language directive via `withLanguageDirective(prompt, locale)`. Do not add prompts that force a Chinese web-novel style; describe craft, not a language market.
- Do not translate the JSON keys or enum values inside archive-extraction templates.

### 5.6 Documentation and screenshots

- Keep `README.md` and `README.en.md` in sync. English docs live in `docs/en/`; Chinese docs in `docs/`.
- Use **American English** in English docs (color, license, organize, normalize, center, catalog).
- Refer to real UI labels. If the English UI says **New book**, **Balance**, **AI & context**, the docs must say the same. Do not invent error messages; quote what the code actually emits.
- Screenshots: 1440×900 PNG, under ~300 KB, English UI for `docs/screenshots/en-*.png`; keep `docs/screenshots/README.md` in sync.
- Every relative link in README/docs must resolve in the repository. Check both languages after editing.
- Do not claim features that are not implemented. If behavior differs between languages, document the difference.

## 6. Git, PR, and release rules

These are hard rules. The repository owner has final say.

1. **Never merge a pull request on your own.** Creating a PR is fine when asked; merging requires an explicit instruction from the owner for that specific PR.
2. **Never push a tag.** A tag push triggers `.github/workflows/release.yml`, which creates a GitHub Release and publishes to npm. Only the owner decides when to release.
3. **Never publish to npm**, run `npm publish`, or bump versions as part of routine work unless asked.
4. **Never rewrite public history** (`push --force`, reset `main`, delete merged commits). If something went wrong, add a revert commit and explain it.
5. By default: work on a branch, run `npm test`, show the diff, and wait for review. Push to `main` only when the owner explicitly says to push directly.
6. Do not commit `dist/`, `src/generated/`, `client/styles.generated.css`, `.tmp-test/`, or `.acl-recovery/`.
7. Keep commits focused and messages imperative; match the existing language of recent commits (Chinese is common) or use English if the owner prefers.
8. Before any release: version bump in a PR, merge, then tag the merged commit on `main`. A PR merge alone never publishes.

## 7. Before you call it done

- [ ] `npm test` passes (build, manifest check, i18n check, smoke).
- [ ] Both Chinese and English UIs were opened and visually checked; no untranslated chrome, no truncated buttons, no overlapping text.
- [ ] Narrow (~860 px) and desktop (~1440 px) layouts checked for the screens touched.
- [ ] New user-visible strings have English dictionary entries; `node scripts/check-i18n.mjs` reports 0 missing.
- [ ] Author content is still untranslated; AI output follows the author's language.
- [ ] Docs updated in both languages; links resolve; screenshots match the real UI.
- [ ] No generated files or secrets in the diff.
- [ ] The diff and test output are shown to the owner before any push, merge, tag, or publish.
