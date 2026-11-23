import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { renderNotFound, renderPage } from "../site/template.mjs"
import { shots as shotConfig } from "../site/shots.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const out = path.join(root, "site-dist")
const PRODUCTION_URL = "https://yanfield.com/"

// SITE_URL is the public address the build will be served from (canonical, sitemap, social cards).
// It defaults to production. Any other address is built as a noindex preview.
let siteUrl = (process.env.SITE_URL || PRODUCTION_URL).trim()
if (!/^https?:\/\//.test(siteUrl)) throw new Error(`SITE_URL must start with http:// or https:// (got "${siteUrl}")`)
if (!siteUrl.endsWith("/")) siteUrl += "/"
const noindex = siteUrl !== PRODUCTION_URL

function tokenBlocks() {
  return readFile(path.join(root, "src/yanfield/app/globals.css"), "utf8").then((source) => {
    const css = source.replaceAll("\r\n", "\n")
    const body = (selectorStart) => {
      const at = css.indexOf(selectorStart)
      if (at < 0) throw new Error(`globals.css: ${selectorStart} not found`)
      const open = css.indexOf("{", at)
      return css.slice(open + 1, css.indexOf("}", open)).trim()
    }
    const light = body(":host,\n.yf-app,\n.yf-portal {")
    const dark = body(':host([data-theme="dark"]),')
    if (!light.includes("--paper:") || !dark.includes("--paper:")) throw new Error("globals.css: design tokens not found")
    return { light, dark }
  })
}

const tokens = await tokenBlocks()
const pick = (block, name) => block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1]
const themeColor = { light: pick(tokens.light, "--paper"), dark: pick(tokens.dark, "--paper") }

const cssSource = await readFile(path.join(root, "site/site.css"), "utf8")
const tokenCss = [
  `:root{${tokens.light}}`,
  `:root[data-theme="dark"]{${tokens.dark}}`,
  `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${tokens.dark}}}`,
].join("\n")
const css = cssSource.replace("/*__TOKENS__*/", tokenCss)
const js = await readFile(path.join(root, "site/site.js"), "utf8")
const version = createHash("sha256").update(css).update(js).digest("hex").slice(0, 8)

async function exists(file) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

async function pngSize(file, rel) {
  const buf = await readFile(file)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buf.length < 24 || !buf.subarray(0, 8).equals(signature)) throw new Error(`Screenshot ${rel} is not a valid PNG`)
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  if (!w || !h) throw new Error(`Screenshot ${rel} has an invalid size`)
  return { w, h }
}

await rm(out, { recursive: true, force: true })
await mkdir(path.join(out, "assets/shots"), { recursive: true })
await mkdir(path.join(out, "en"), { recursive: true })

const found = { zh: {}, en: {} }
for (const [lang, byId] of Object.entries(shotConfig)) {
  for (const [id, variants] of Object.entries(byId)) {
    for (const [theme, rel] of Object.entries(variants)) {
      const src = path.join(root, rel)
      if (!(await exists(src))) throw new Error(`Screenshot ${rel} (${lang}/${id}/${theme}, configured in site/shots.mjs) does not exist`)
      const name = path.basename(rel)
      await copyFile(src, path.join(out, "assets/shots", name))
      const { w, h } = await pngSize(src, rel)
      ;(found[lang][id] ||= {})[theme] = { src: `assets/shots/${name}`, w, h }
    }
  }
}

await copyFile(path.join(root, "icon.svg"), path.join(out, "assets/icon.svg"))
await copyFile(path.join(root, "docs/screenshots/market-icon.png"), path.join(out, "assets/icon-192.png"))
await writeFile(path.join(out, "assets/site.css"), css)
await writeFile(path.join(out, "assets/site.js"), js)

const ctx = { siteUrl, noindex, themeColor, version, shots: found }
await writeFile(path.join(out, "index.html"), renderPage("zh", ctx))
await writeFile(path.join(out, "en/index.html"), renderPage("en", ctx))
await writeFile(path.join(out, "404.html"), renderNotFound(ctx, css))
await writeFile(path.join(out, ".nojekyll"), "")

const robots = noindex
  ? "User-agent: *\nDisallow: /\n"
  : `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`
await writeFile(path.join(out, "robots.txt"), robots)
if (!noindex) {
  const entry = (loc) =>
    `  <url>\n    <loc>${loc}</loc>\n    <xhtml:link rel="alternate" hreflang="zh-Hans" href="${siteUrl}"/>\n    <xhtml:link rel="alternate" hreflang="en" href="${siteUrl}en/"/>\n    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}"/>\n  </url>`
  await writeFile(
    path.join(out, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entry(siteUrl)}\n${entry(siteUrl + "en/")}\n</urlset>\n`,
  )
}

const shotCount = Object.values(found).reduce((n, byId) => n + Object.values(byId).reduce((m, v) => m + Object.keys(v).length, 0), 0)
console.log(`site built → site-dist (${siteUrl}${noindex ? ", noindex preview" : ""}, ${shotCount} screenshots)`)
