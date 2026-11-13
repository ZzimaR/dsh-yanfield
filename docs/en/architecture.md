# Architecture

## 1. Shape

Yanfield is one package that ships two halves:

```
dsh-yanfield
├── dist/host.js     host half (Node / ESM): HTTP routes under /yanfield, bridge to Harness models and account
├── dist/client.js   browser half (CJS bundle): sidebar entry, main panel, right-hand tabs, panel rendering
├── cordis.patch.yml inserts the plugin into the Harness composition with id=yanfield
└── vendor/yanfield/ the desk itself (React + domain logic + SQLite access)
```

Host entry `src/host.ts` exports `{ name, apply }`:

- `apply(ctx, config)` creates the bridge (`createBridge`) and mounts the HTTP handler on the `webServer` under `/yanfield`;
- requires `connection` and `webServer`; `llm` is obtained lazily via `ctx.inject(["llm"], …)`;
- `deepseekAccount` is deliberately *not* in `inject` — it is probed with `ctx.get("deepseekAccount")` so profiles without the account service still boot.

Browser entry `client/index.tsx` attaches an open shadow root to the host element Harness provides, injects the compiled CSS into it, mounts the React app plus a portal container, and registers four slots:

| Slot | Content |
| --- | --- |
| `main` | the Yanfield panel (key `yanfield`) |
| `sidebar.panellist` | the **Yanfield** sidebar entry |
| `sidebarRightTabs` / `sidebar.right.pane.tab` | right-hand tab |

## 2. Why Shadow DOM

Harness is itself a Tailwind app with global resets and `@property` rules. Yanfield keeps its whole tree inside a shadow root so the two style worlds do not collide, and so the theme becomes one controllable layer:

1. every design token is defined on `:host, .yf-app, .yf-portal`;
2. theming writes `data-theme` onto each root via `setThemeRoots([host, mount, portal])` + `applyTheme`;
3. a `MutationObserver` watches `document.body[data-ds-dark-theme]` and mirrors Harness' light/dark changes in real time.

**Browser quirk worth knowing**: Chrome does not register `@property` rules declared inside a shadow root. Tailwind v4 utilities such as `border-*`, `shadow-*` and `ring-*` compile to `var(--tw-*)` with no fallback, so the plugin copies every `@property` block from the CSS into `document.head` once (`registerAtProperties`). Without that, all borders and shadows disappear.

Menus, dialogs and toasts render into `.yf-portal` (a fixed container inside the shadow root). Because it is not a direct child of the document, positioning and overlay bounds are computed from the panel host element's `getBoundingClientRect()` (`yanfieldPanelBounds()`); otherwise fixed overlays would cover the whole Harness window.

Shadow DOM also retargets `event.target` for document-level listeners, so "click outside to close" would treat clicks inside an overlay as outside. Those components use `event.composedPath()` instead (`isInsideComposedPath`).

## 3. Routes and build

`vendor/yanfield/app/api/**/route.ts` are Next.js-style route files exporting `GET` / `POST` / `PATCH` / `DELETE`. `scripts/build.mjs`:

1. scans them and generates `src/generated/routes.js` (a `path → handlers` table, currently 48 routes);
2. compiles `client/app.css` (Tailwind + vendored `globals.css`) with `@tailwindcss/cli` into `client/styles.generated.css` and appends a small module CSS file;
3. bundles with esbuild: `dist/client.js` (CJS, browser, CSS as text, `__YANFIELD_BUILD__` build stamp) and `dist/host.js` (ESM, node22);
4. aliases `@/` to `vendor/yanfield/`, so vendored code keeps its imports.

The host half maps `/yanfield/api/*` onto that table, reusing Harness' session auth, error wrapping and SSE streaming.

## 4. Data

SQLite, default `$DSH_HOME/yanfield/yanfield.db`; override with `YANFIELD_DB_PATH` or the plugin's `dataDir` config.

| Table | Contents |
| --- | --- |
| `novels` / `volumes` / `chapters` | novels, volumes, chapters (prose as HTML) |
| `novel_outlines` / `volume_outlines` / `chapter_blueprints` | three-level outline and blueprints |
| `characters` / `world_settings` / `foreshadows` | notes |
| `story_archives` | summaries, states, changes, timeline, conflicts |
| `chat_sessions` / `chat_messages` | AI conversations |
| `agent_runs` (with change payloads) | multi-step runs, candidate changes, state |
| `providers` / `app_settings` / `prompt_presets` | model services, settings, presets |
| `ai_logs` / `word_snapshots` | usage log, word snapshots |

The database is the single source of truth; the UI keeps no draft copy (review state is restored from the run record on the server).

## 5. One AI edit, end to end

```
user message
  → POST /yanfield/api/ai/agent (SSE)
  → runAgent decision loop (max 12 rounds)
      ├─ read notes (read-only, on demand)
      ├─ propose_changes (prose diff / note patches → pending candidates)
      └─ round, budget and repeated-failure guards
  → UI streams progress and candidates
  → inline review: keep / revert per paragraph
  → confirm → POST /yanfield/api/ai/agent/:id/apply (version check + transaction)
  → optional undo (op:"undo")
```

Prose requests are serialized with stable notes first, current prose and task last, deduplicating repeated prose to improve prefix-cache hits.

## 6. Boundaries

- All model calls go through the host bridge (`HarnessBridge`); the browser never sees credentials and never talks to DeepSeek directly.
- No telemetry, no upload of manuscripts. Context is only sent when you actually send an AI request, to the DeepSeek service you selected.
- No third-party gateways; multi-provider support was removed during the plugin port.
- Host-side changes require restarting Harness; browser-side changes only need a refresh (asset URLs carry a content hash `rev`).
