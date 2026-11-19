import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { commands, pages } from "../site/content.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dist = path.join(root, "site-dist")
const failures = []
const fail = (message) => failures.push(message)

async function read(rel) {
  try {
    return await readFile(path.join(dist, rel), "utf8")
  } catch {
    fail(`missing site-dist/${rel}; run npm run build:site first`)
    return ""
  }
}

// 1. The two dictionaries have the same shape and the same placeholders.
function compare(a, b, where) {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return fail(`${where}: type differs between zh and en`)
  if (Array.isArray(a)) {
    if (a.length !== b.length) fail(`${where}: length differs (${a.length} vs ${b.length})`)
    a.forEach((item, i) => b[i] !== undefined && compare(item, b[i], `${where}[${i}]`))
  } else if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      if (!(key in a) || !(key in b)) fail(`${where}.${key}: missing in one language`)
      else compare(a[key], b[key], `${where}.${key}`)
    }
  } else if (typeof a === "string") {
    const holders = (s) => (s.match(/\{\w+\}/g) || []).sort().join()
    if (holders(a) !== holders(b)) fail(`${where}: placeholders differ`)
    if (!a.trim() || !b.trim()) fail(`${where}: empty string`)
  }
}
const SHARED_KEYS = new Set(["lang", "htmlLang", "ogLocale"])
for (const key of Object.keys(pages.zh)) if (!SHARED_KEYS.has(key)) compare(pages.zh[key], pages.en[key], key)

// 2. English chrome has no CJK except the language switch label and the brand name.
const cjk = /[\u3400-\u9fff]/
function scan(node, where) {
  if (typeof node === "string") {
    if (cjk.test(node.replace(/砚田/g, ""))) fail(`en.${where}: contains Chinese text: ${node.slice(0, 40)}`)
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) if (!(where === "" && (k === "langSwitch")) && !(where === "notFound" && k === "other")) scan(v, where ? `${where}.${k}` : k)
  }
}
scan(pages.en, "")

// 3. Built pages.
const zh = await read("index.html")
const en = await read("en/index.html")
const notFound = await read("404.html")
const css = await read("assets/site.css")
const js = await read("assets/site.js")
const robots = await read("robots.txt")

const ids = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))
const count = (html, re) => (html.match(re) || []).length

for (const [name, html, lang] of [["index.html", zh, "zh"], ["en/index.html", en, "en"]]) {
  if (!html) continue
  const own = ids(html)
  for (const m of html.matchAll(/href="#([^"]+)"/g)) if (!own.has(m[1])) fail(`${name}: href="#${m[1]}" has no target`)
  for (const m of html.matchAll(/aria-controls="([^"]+)"/g)) if (!own.has(m[1])) fail(`${name}: aria-controls="${m[1]}" has no target`)
  const base = path.dirname(path.join(dist, name))
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)) {
    const url = m[1]
    if (/^(https?:|mailto:|data:)/.test(url) || url === "./") continue
    try {
      const target = path.resolve(base, url)
      const info = await stat(target)
      if (info.isDirectory()) await stat(path.join(target, "index.html"))
    } catch {
      fail(`${name}: broken relative link ${url}`)
    }
  }
  for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?\s(?:src|href)="(https?:\/\/[^"]+)"[^>]*>/g)) {
    if (!/rel="(canonical|alternate)"|property=|<link rel="alternate"/.test(m[0])) fail(`${name}: external resource ${m[1]}`)
  }
  for (const needed of ['<html lang="', 'rel="canonical"', 'hreflang="x-default"', 'name="description"', 'property="og:title"', 'type="application/ld+json"', 'id="main"', 'class="skip"']) {
    if (!html.includes(needed)) fail(`${name}: missing ${needed}`)
  }
  if (count(html, /<h1[\s>]/g) !== 1) fail(`${name}: expected exactly one h1`)
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt="[^"]+"/.test(m[0]) || !/\swidth=/.test(m[0])) fail(`${name}: img without alt/width: ${m[0].slice(0, 60)}`)
  for (const m of html.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)) {
    if (!m[1].replace(/<[^>]+>/g, "").trim() && !/aria-label=/.test(m[0])) fail(`${name}: icon-only button without aria-label`)
  }
  for (const cmd of Object.values(commands)) if (!html.includes(cmd)) fail(`${name}: missing install command "${cmd}"`)
  if (!html.includes("0.2.1-rc.5")) fail(`${name}: missing minimum DSH version`)
  if (/open[- ]source/i.test(html.replace(/not an unrestricted open-source license/i, "")) && lang === "en") fail(`${name}: "open source" wording`)
  if (/github\.com\/ZzimaR\/yanfield(?![\w-])/.test(html.replace(/<a href="https:\/\/github\.com\/ZzimaR\/yanfield"[^>]*>/g, ""))) fail(`${name}: legacy repo linked outside the history link`)
}
if (zh && en) {
  for (const re of [/<details>/g, /role="tab"/g, /class="para"|data-para/g, /<section\b/g, /<li\b/g, /<tr\b/g]) {
    if (count(zh, re) !== count(en, re)) fail(`zh and en pages differ in structure for ${re}`)
  }
}

// 4. Design-token discipline and motion safety.
const cssBody = css.split("\n").filter((line) => !/^\s*--[\w-]+:\s*#/.test(line)).join("\n")
if (/#[0-9a-fA-F]{3,8}\b/.test(cssBody.replace(/\{[^}]*--paper:[^}]*\}/g, ""))) fail("site.css: raw hex color outside the design tokens")
if (!css.includes("prefers-reduced-motion")) fail("site.css: no prefers-reduced-motion handling")
if (/@import|url\(\s*["']?https?:/.test(css)) fail("site.css: external import/url")
if (/fetch\(|XMLHttpRequest|sendBeacon/.test(js)) fail("site.js: network calls are not allowed")

// 5. Crawling files agree with the build address.
const canonical = zh.match(/rel="canonical" href="([^"]+)"/)?.[1] || ""
const production = canonical === "https://yanfield.com/"
const noindexPage = /content="noindex/.test(zh)
if (production && noindexPage) fail("production build must be indexable")
if (!production && !noindexPage) fail("non-production build must be noindex")
if (production) {
  if (!robots.includes("Sitemap: https://yanfield.com/sitemap.xml")) fail("robots.txt: missing sitemap")
  const sitemap = await read("sitemap.xml")
  if (!sitemap.includes("https://yanfield.com/en/")) fail("sitemap.xml: missing English page")
} else if (!robots.includes("Disallow: /")) fail("robots.txt: preview build must disallow crawling")
if (notFound && !notFound.includes("noindex")) fail("404.html: should be noindex")
for (const file of ["assets/icon.svg", ".nojekyll"]) await read(file)

if (failures.length) {
  console.error(`check-site: ${failures.length} problem(s)\n- ${failures.join("\n- ")}`)
  process.exit(1)
}
console.log("check-site: ok")
