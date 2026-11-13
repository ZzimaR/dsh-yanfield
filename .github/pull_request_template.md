# Pull Request

## What does this PR do?

<!-- One paragraph on the purpose; link issues with `Closes #123`. 中文说明也可以。 -->

Closes #

## Changes

<!-- List the main changes by file/module to make review easier. -->

-
-

## Type

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 🎨 UI / styling / copy
- [ ] ♻️ Refactor (no behavior change)
- [ ] 📝 Docs / screenshots
- [ ] 🔧 Build / dependencies
- [ ] 💥 Breaking data or API change (explain below)

## Self-test

- [ ] `node scripts/build.mjs` passes
- [ ] `node scripts/check.mjs` passes
- [ ] `node scripts/smoke.mjs` passes
- [ ] Installed with the DSH CLI into a test profile and manually checked the affected pages
- [ ] Changed host-side code (`src/host.ts`, `vendor/yanfield/lib`, API routes) → restarted DSH, not just refreshed
- [ ] AI changes were tested in an isolated library (`yanfield-dev` + `config.dataDir`), not the real one

<!-- Paste key output (build log, probe JSON, screenshots). -->

## Screenshots (required for UI changes)

<!-- Before/after is best; light and dark if possible. -->

## Checklist

- [ ] No `dist/`, package archives, `.tmp-test/`, `data/`, `client/styles.generated.css`, or `src/generated/`
- [ ] No Node-only modules (`node:sqlite` / `node:fs` / `@/lib/db`) in the client bundle
- [ ] New copy is translated in both Chinese and English (`vendor/yanfield/lib/i18n/en/`), and README / docs are updated (including `docs/en/`)
- [ ] No private data (API keys, manuscript text, personal paths)
