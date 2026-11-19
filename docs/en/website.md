# Public website

The marketing site for <https://yanfield.com> lives in [`site/`](../../site) and is a plain static site: no framework and no runtime dependencies. It is built into `site-dist/` (git-ignored) by `scripts/build-site.mjs` and deployed to GitHub Pages by [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml). It does not touch the plugin bundle.

## Layout

| Path | Role |
| --- | --- |
| `site/content.mjs` | All copy, in Simplified Chinese (`zh`) and English (`en`). Both languages must have the same shape; `check:site` enforces it. Manuscript demo text stays untranslated. |
| `site/template.mjs` | HTML for the two pages and `404.html` |
| `site/site.css` | Styles. Color tokens are copied from `src/yanfield/app/globals.css` at build time, so the site never defines its own palette. |
| `site/site.js` | Theme, menu, tabs, review demo, copy button. The page is fully readable without it. |
| `site/shots.mjs` | Which screenshots appear in the gallery |

The Chinese page is `/` and the English page is `/en/`; the language switch is a normal link that also remembers your choice. All links between pages and assets are relative, so the build works on a custom domain and on a project path such as `https://zzimar.github.io/dsh-yanfield/`.

## Commands

```bash
npm run build:site     # writes site-dist/
npm run check:site     # structure, bilingual parity, links, metadata, token and motion rules
npm run preview:site   # serves site-dist at http://127.0.0.1:4173/ (PORT to change)
```

`SITE_URL` sets the public address used for canonical links, the sitemap and social cards. It defaults to `https://yanfield.com/`. Any other value produces a **noindex preview** (`robots.txt` disallows crawling), which keeps a staging copy from competing with the real site.

```bash
SITE_URL=https://zzimar.github.io/dsh-yanfield/ npm run build:site
```

## Screenshots

The gallery uses real captures from `docs/screenshots/`, listed in `site/shots.mjs` (Chinese UI: `workspace.png`, `workspace-dark.png`, `library.png`; English UI: `en-editor.png`, `en-editor-dark.png`, `en-library.png`). Replace a file with a fresh 1440×900 capture of the current build and rebuild. Every listed file is required: the build fails if one is missing or is not a PNG. The hero is an HTML illustration, labeled as such, not a screenshot.

## Deploying to GitHub Pages

The workflow runs on pushes to `main` that touch the site files, and on manual dispatch. It builds, runs `check:site`, uploads `site-dist/`, and deploys with `contents: read` plus `pages: write` / `id-token: write` on the deploy job only.

One-time setup (repository owner): **Settings → Pages → Build and deployment → Source: GitHub Actions**. Until Pages is enabled, the workflow stops at the *configure-pages* step. The build address comes from the Pages configuration, so the first deploys appear as a noindex preview at the project URL.

## Moving yanfield.com from the old repository

`yanfield.com` is currently served by the Pages site of the earlier standalone repository, [ZzimaR/yanfield](https://github.com/ZzimaR/yanfield). A custom domain can be used by only one repository at a time, and nothing in this repository takes it over automatically. The workflow never writes a `CNAME` file; with the Actions source, the domain is configured in settings only.

1. Enable Pages (source: GitHub Actions) in this repository and run **Pages** from the Actions tab. Check the preview at the project URL in both languages and both themes.
2. In the old repository, open **Settings → Pages** and remove the custom domain. The old site stops answering on `yanfield.com` from this moment.
3. In this repository, open **Settings → Pages**, set **Custom domain** to `yanfield.com`, wait for the DNS check to pass, then enable **Enforce HTTPS**. The DNS records can stay as they are if they already point at GitHub Pages for the `ZzimaR` account.
4. Run the **Pages** workflow again. With the custom domain configured, the build address becomes `https://yanfield.com/`, so the site is built indexable with a sitemap.
5. Archiving the old repository is a separate decision for the owner; the site links to it only as history.

To roll back, remove the domain here and set it again in the old repository.
