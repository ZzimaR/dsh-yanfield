import { commands, demoParas, links, pages, sampleBook, shotIds } from "./content.mjs"

const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, key) => (vars[key] ?? `{${key}}`))
const lookup = (path, lang) => path.split(".").reduce((node, key) => node?.[key], key0(lang))
const key0 = (lang) => ({ ...links, docs: links.docs[lang] })

const iconSvg = `<svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" focusable="false"><rect x="2.5" y="2.5" width="59" height="59" rx="15" fill="var(--paper)" stroke="var(--line-strong)" stroke-width="1.5"/><g fill="none" stroke="var(--danger)"><rect x="11" y="11" width="42" height="42" rx="5" stroke-width="2.6"/><path d="M32 11v42M11 32h42" stroke-width="1.6" stroke-dasharray="3 2.6" opacity=".7"/></g><path d="M22.5 18c1.6-1.4 4.6-.9 8 1.2 5.6 3.4 11.4 8.6 12.3 14.6.8 5.4-2.6 9.6-7.6 9.6-4.6 0-7.6-3.4-7.4-7.8.2-3.6-1-7.8-4.2-12.8-1.2-1.9-2.2-3.6-1.1-4.8Z" fill="var(--ink)"/></svg>`

const arrow = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`

function segs(para) {
  return para
    .map(([kind, text]) =>
      kind === "d" ? `<del data-seg="d">${esc(text)}</del>` : kind === "i" ? `<ins data-seg="i">${esc(text)}</ins>` : `<span data-seg="s">${esc(text)}</span>`,
    )
    .join("")
}

function head(c, no, kicker, title, lede) {
  return `<header class="sec-head rv"><p class="sec-no" aria-hidden="true">${no}</p><p class="kicker">${kicker}</p><h2>${title}</h2>${lede ? `<p class="lede">${lede}</p>` : ""}</header>`
}

function shotFigure(c, shot, id, lang, rel) {
  const [label, caption] = c.desk.shots[id]
  const variants = shot
  const img = (variant, cls) =>
    `<img class="${cls}" src="${rel}${variant.src}" width="${variant.w}" height="${variant.h}" alt="${esc(`${label} — ${caption}`)}" loading="lazy" decoding="async">`
  const imgs =
    variants.light && variants.dark
      ? img(variants.light, "shot-light") + img(variants.dark, "shot-dark")
      : img(variants.light || variants.dark, "shot-any")
  return `<figure class="shot">${imgs}<figcaption><strong>${label}</strong> ${caption}</figcaption></figure>`
}

function gallery(c, lang, ctx, rel) {
  const found = shotIds.filter((id) => ctx.shots[lang]?.[id])
  if (!found.length) return ""
  const tabs = found
    .map(
      (id, i) =>
        `<button type="button" role="tab" id="tab-shot-${id}" aria-controls="panel-shot-${id}" aria-selected="${i === 0}" data-tab="${id}" tabindex="${i === 0 ? 0 : -1}">${c.desk.shots[id][0]}</button>`,
    )
    .join("")
  const panels = found
    .map(
      (id) =>
        `<div class="tabpanel" role="tabpanel" id="panel-shot-${id}" aria-labelledby="tab-shot-${id}" data-panel="${id}">${shotFigure(c, ctx.shots[lang][id], id, lang, rel)}</div>`,
    )
    .join("")
  return `<div class="gallery rv" data-tabs><div class="tablist js-only" role="tablist" aria-label="${esc(c.desk.tabsLabel)}">${tabs}</div>${panels}<p class="fine">${c.desk.shotNote}</p></div>`
}

function mock(c) {
  const p = c.preview
  const tree = sampleBook.volumes
    .map(
      (vol, vi) =>
        `<li class="m-vol"><span>${vol.name}</span><ul>${vol.chapters
          .map((ch, ci) => `<li class="m-ch${vi === 0 && ci === 0 ? " is-on" : ""}">${ch}</li>`)
          .join("")}</ul></li>`,
    )
    .join("")
  return `<div class="deskmock" data-mini data-state="pending" data-msg-kept="${esc(p.kept)}" data-msg-reverted="${esc(p.reverted)}" data-msg-pending="${esc(p.pending)}" role="group" aria-label="${esc(p.region)}">
  <div class="m-top"><span class="m-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="m-crumb" lang="zh-Hans">${sampleBook.title} · 第一卷 · 退潮 · 第一章 空信</span><span class="m-saved">${p.saved}</span></div>
  <div class="m-body">
    <div class="m-side"><div class="m-tabs">${p.tabs.map((t, i) => `<span class="${i === 0 ? "is-on" : ""}">${t}</span>`).join("")}</div><ul class="m-tree" lang="zh-Hans">${tree}</ul></div>
    <div class="m-page" lang="zh-Hans"><h3>第一章 空信</h3><p class="m-meta">319 ${esc(p.words)}</p><p class="m-prose">${segs(demoParas[0])}</p><p class="m-prose m-faint">周晚把油布账本摊在石阶上，数了数刚冒出来的信。三封。</p></div>
    <div class="m-ai"><p class="m-ai-title">${p.assistant}</p><p class="m-bubble">${p.request}</p>
      <div class="m-card"><p class="m-card-title" data-mini-status role="status">${p.pending}</p>
        <div class="m-card-actions js-only"><button type="button" data-mini-act="keep">${p.keep}</button><button type="button" data-mini-act="revert">${p.revert}</button></div></div></div>
  </div></div>`
}

function review(c) {
  const r = c.review
  const total = demoParas.length
  const paras = demoParas
    .map((para, i) => {
      const word = fill(r.paraWord, { n: i + 1 })
      return `<li class="para" data-para data-state="pending"><div class="para-head"><span class="para-no">0${i + 1}</span><span class="para-kind">${r.paraLabel}</span><div class="para-actions js-only" role="group" aria-label="${esc(word)}"><button type="button" data-act="keep" aria-pressed="false" aria-label="${esc(`${r.keep} · ${word}`)}">${r.keep}</button><button type="button" data-act="revert" aria-pressed="false" aria-label="${esc(`${r.revert} · ${word}`)}">${r.revert}</button></div></div><p class="para-text" lang="zh-Hans">${segs(para)}</p></li>`
    })
    .join("")
  return `<div class="review rv" data-review data-total="${total}" data-count="${esc(r.count)}" data-tag-kept="${esc(r.tagKept)}" data-tag-reverted="${esc(r.tagReverted)}" data-tag-pending="${esc(r.tagPending)}" data-confirmed="${esc(r.confirmed)}">
  <div class="review-bar"><span class="badge">${r.demoBadge}</span><span class="review-note">${r.demoNote}</span></div>
  <p class="review-req"><span>${r.requestLabel}</span>${r.request}</p>
  <div class="review-grid">
    <div class="review-draft"><div class="review-title"><h3>${r.draftTitle}</h3><span class="count" data-count-out role="status" aria-live="polite"></span></div>
      <p class="legend"><span class="lg lg-i">${r.legendAdd}</span><span class="lg lg-d">${r.legendDel}</span></p>
      <p class="nojs-only fine">${r.noJs}</p>
      <div class="review-tools js-only"><button type="button" class="btn btn-quiet" data-all="keep">${r.keepAll}</button><button type="button" class="btn btn-quiet" data-all="revert">${r.revertAll}</button><button type="button" class="btn btn-quiet" data-reset>${r.reset}</button></div>
      <ol class="paras">${paras}</ol>
      <div class="review-confirm js-only"><button type="button" class="btn btn-solid" data-confirm>${r.confirm}</button><p class="confirm-msg" data-confirm-msg role="status"></p></div>
    </div>
    <aside class="review-out js-only" aria-label="${esc(r.outTitle)}"><h3>${r.outTitle}</h3><p class="fine">${r.outHint}</p><div class="out-text" data-out lang="zh-Hans"></div></aside>
  </div>
  <p class="fine">${r.manuscriptNote}</p></div>`
}

function install(c) {
  const i = c.install
  const block = (id) => `<div class="cmd"><code id="cmd-${id}"><span class="prompt" aria-hidden="true">$</span> ${esc(commands[id])}</code><button type="button" class="copy js-only" data-copy="cmd-${id}" data-text="${esc(commands[id])}" data-l-copy="${esc(i.copy)}" data-l-done="${esc(i.copied)}" data-l-fail="${esc(i.copyFailed)}">${i.copy}</button></div>`
  const ids = ["web", "desktop"]
  const tabs = ids
    .map((id, n) => `<button type="button" role="tab" id="tab-cmd-${id}" aria-controls="panel-cmd-${id}" aria-selected="${n === 0}" tabindex="${n === 0 ? 0 : -1}" data-tab="${id}">${i.tabs[id]}</button>`)
    .join("")
  const panels = ids
    .map((id) => `<div class="tabpanel" role="tabpanel" id="panel-cmd-${id}" aria-labelledby="tab-cmd-${id}" data-panel="${id}"><p class="cmd-label nojs-only">${i.tabs[id]}</p>${block(id)}</div>`)
    .join("")
  const steps = i.steps.map(([t, d], n) => `<li><span class="step-no" aria-hidden="true">${n + 1}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join("")
  return `<div class="install rv"><div data-tabs class="cmdtabs"><div class="tablist js-only" role="tablist" aria-label="${esc(i.tabsLabel)}">${tabs}</div>${panels}<p class="copy-status" data-copy-status role="status" aria-live="polite"></p></div><ol class="steps">${steps}</ol><p class="fine">${fill(i.update, links)}</p><p class="fine">${fill(i.wip, links)}</p></div>`
}

export function renderPage(lang, ctx) {
  const c = pages[lang]
  const other = lang === "zh" ? "en" : "zh"
  const rel = lang === "zh" ? "" : "../"
  const url = (l) => ctx.siteUrl + (l === "zh" ? "" : "en/")
  const ogShot = ctx.shots[lang]?.desk
  const ogVariant = ogShot && (ogShot.light || ogShot.dark)
  const ogImage = ogVariant ? ctx.siteUrl + ogVariant.src : ctx.siteUrl + "assets/icon-192.png"
  const asset = (name) => `${rel}assets/${name}?v=${ctx.version}`
  const ld = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: lang === "zh" ? "砚田 Yanfield" : "Yanfield",
    operatingSystem: "DeepSeek Harness >= 0.2.1-rc.5",
    description: c.description,
    url: url(lang),
    inLanguage: c.lang,
    license: links.license,
    downloadUrl: links.npm,
    codeRepository: links.repo,
    author: { "@type": "Person", name: "ZzimaR", url: "https://github.com/ZzimaR" },
  }
  const hasZhFlip = lang === "zh"
  const boot = `(function(){var d=document.documentElement;d.classList.remove("no-js");d.classList.add("js");try{var t=localStorage.getItem("yanfield-site-theme");if(t==="dark"||t==="light")d.dataset.theme=t;${hasZhFlip ? 'if(localStorage.getItem("yanfield-site-lang")==="en"&&!/[?&]stay/.test(location.search))location.replace("en/"+location.hash)' : ""}}catch(e){}})()`
  const ext = esc(c.ext)
  const extLink = (href, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}<span class="sr-only"> ${ext}</span></a>`

  const nav = c.nav.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")
  const principles = c.principles.items
    .map((p, n) => `<li class="rv" style="--d:${n * 80}ms"><span class="pr-no" aria-hidden="true">${["一", "二", "三"][n]}</span><h3>${p.title}</h3><p>${p.body}</p></li>`)
    .join("")
  const deskFacts = c.desk.facts.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")
  const noteItems = c.notes.items.map(([t, d], n) => `<li><span class="idx" aria-hidden="true">${String(n + 1).padStart(2, "0")}</span><div><h3>${t}</h3><p>${d}</p></div></li>`).join("")
  const noteAside = c.notes.aside.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")
  const m = c.models
  const modelRows = m.rows.map((r) => `<tr><th scope="row">${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")
  const dataItems = c.data.items.map(([t, d]) => `<div class="rv"><dt>${t}</dt><dd>${fill(d, links)}</dd></div>`).join("")
  const faq = c.faq.items.map(([q, a]) => `<details><summary>${q}</summary><p>${fill(a, links)}</p></details>`).join("")
  const footerGroups = c.footer.groups
    .map((g) => `<div><h3>${g.title}</h3><ul>${g.links.map(([label, key]) => `<li>${extLink(lookup(key, lang), label)}</li>`).join("")}</ul></div>`)
    .join("")

  return `<!doctype html>
<html lang="${c.htmlLang}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<meta name="robots" content="${ctx.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}">
<link rel="canonical" href="${url(lang)}">
<link rel="alternate" hreflang="zh-Hans" href="${url("zh")}">
<link rel="alternate" hreflang="en" href="${url("en")}">
<link rel="alternate" hreflang="x-default" href="${url("zh")}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="${ctx.themeColor.light}">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${ctx.themeColor.dark}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Yanfield 砚田">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.description)}">
<meta property="og:url" content="${url(lang)}">
<meta property="og:locale" content="${c.ogLocale}">
<meta property="og:locale:alternate" content="${pages[other].ogLocale}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:alt" content="${esc(c.ogAlt)}">
<meta name="twitter:card" content="${ogVariant ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(c.title)}">
<meta name="twitter:description" content="${esc(c.description)}">
<link rel="icon" href="${rel}assets/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${rel}assets/icon-192.png">
<script>${boot}</script>
<link rel="stylesheet" href="${asset("site.css")}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<a class="skip" href="#main">${c.skip}</a>
<header class="top" data-top>
  <div class="wrap top-in">
    <a class="brand" href="${rel || "./"}" aria-label="${esc(c.brandLabel)}">${iconSvg}<span class="brand-name"><b>砚田</b> Yanfield</span></a>
    <nav class="nav" id="site-nav" aria-label="${esc(c.navLabel)}" data-nav>${nav}</nav>
    <div class="tools">
      <a class="pill" href="${lang === "zh" ? "en/" : "../"}" hreflang="${other === "zh" ? "zh-Hans" : "en"}" lang="${other === "zh" ? "zh-Hans" : "en"}" data-lang="${other}" aria-label="${esc(c.langSwitch.label)}">${c.langSwitch.text}</a>
      <button type="button" class="pill icon js-only" data-theme-toggle data-l-night="${esc(c.theme.toNight)}" data-l-paper="${esc(c.theme.toPaper)}" aria-label="${esc(c.theme.toNight)}"><svg class="i-moon" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z" fill="currentColor"/></svg><svg class="i-sun" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>
      <button type="button" class="pill menu js-only" data-menu aria-expanded="false" aria-controls="site-nav" data-l-open="${esc(c.menu.open)}" data-l-close="${esc(c.menu.close)}" aria-label="${esc(c.menu.open)}"><span>${c.menu.text}</span></button>
    </div>
  </div>
</header>
<main id="main">
<section class="hero" id="top" data-hero>
  <div class="hero-grid" aria-hidden="true"></div>
  <div class="wrap hero-in">
    <div class="hero-copy">
      <p class="eyebrow rise" style="--d:0ms"><span class="dot"></span>${c.hero.eyebrow}</p>
      <h1 class="rise" style="--d:90ms">${c.hero.title}</h1>
      <p class="hero-lede rise" style="--d:180ms">${c.hero.lede}</p>
      <div class="cta rise" style="--d:270ms"><a class="btn btn-solid" href="#install">${c.hero.install}${arrow}</a>${extLink(links.repo, c.hero.github).replace("<a ", '<a class="btn btn-line" ')}</div>
      <dl class="facts rise" style="--d:360ms">${c.hero.facts.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")}</dl>
    </div>
    <div class="hero-art rise" style="--d:200ms" data-parallax>
      <div class="layer sheet" aria-hidden="true" data-depth="-6"></div>
      <div class="layer mockwrap" data-depth="4"><p class="mock-label"><span class="badge">${c.preview.label}</span> ${c.preview.note}</p>${mock(c)}</div>
      <div class="seal" aria-hidden="true"><span>砚田</span></div>
    </div>
  </div>
</section>

<section class="principles" aria-label="${esc(c.principles.label)}"><div class="wrap"><ol>${principles}</ol></div></section>

<section class="sec" id="desk"><div class="wrap sec-grid">
  ${head(c, c.desk.no, c.desk.kicker, c.desk.title, c.desk.lede)}
  <div class="sec-body">
    ${gallery(c, lang, ctx, rel)}
    <dl class="defs rv">${deskFacts}</dl>
    <p class="pull rv">${c.desk.language}</p>
  </div>
</div></section>

<section class="sec sec-tint" id="review"><div class="wrap sec-grid">
  ${head(c, c.review.no, c.review.kicker, c.review.title, c.review.lede)}
  <div class="sec-body">${review(c)}</div>
</div></section>

<section class="sec" id="notes"><div class="wrap sec-grid">
  ${head(c, c.notes.no, c.notes.kicker, c.notes.title, c.notes.lede)}
  <div class="sec-body"><ol class="index rv">${noteItems}</ol><dl class="defs rv">${noteAside}</dl></div>
</div></section>

<section class="sec sec-tint" id="models"><div class="wrap sec-grid">
  ${head(c, m.no, m.kicker, m.title, m.lede)}
  <div class="sec-body"><div class="tablewrap rv" tabindex="0" role="region" aria-label="${esc(m.tableLabel)}"><table><thead><tr>${m.head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${modelRows}</tbody></table></div>
  <p class="fine rv">${m.cost}</p><p class="fine rv">${m.more} ${extLink(links.docs[lang].ai, m.moreLink)}.</p></div>
</div></section>

<section class="sec" id="install"><div class="wrap sec-grid">
  ${head(c, c.install.no, c.install.kicker, c.install.title, c.install.lede)}
  <div class="sec-body">${install(c)}</div>
</div></section>

<section class="sec sec-tint" id="data"><div class="wrap sec-grid">
  ${head(c, c.data.no, c.data.kicker, c.data.title, "")}
  <div class="sec-body"><dl class="defs defs-wide">${dataItems}</dl></div>
</div></section>

<section class="sec" id="faq"><div class="wrap sec-grid">
  ${head(c, c.faq.no, c.faq.kicker, c.faq.title, "")}
  <div class="sec-body"><div class="faq rv">${faq}</div></div>
</div></section>
</main>
<footer class="foot"><div class="wrap">
  <div class="foot-top"><div><p class="foot-brand">${iconSvg}<span><b>砚田</b> Yanfield</span></p><p>${c.footer.tagline}</p><p class="fine">${c.footer.madeBy}</p></div>${footerGroups}</div>
  <p class="foot-end"><a href="#top">${c.footer.top}</a></p>
</div></footer>
<script src="${asset("site.js")}" defer></script>
</body>
</html>
`
}

export function renderNotFound(ctx, css) {
  const home = (lang) => ctx.siteUrl + (lang === "zh" ? "" : "en/")
  const block = (lang) => {
    const n = pages[lang].notFound
    return `<section lang="${pages[lang].htmlLang}"><h1>${n.heading}</h1><p>${n.body}</p><p><a class="btn btn-solid" href="${home(lang)}">${n.home}</a></p></section>`
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pages.zh.notFound.title)} / ${esc(pages.en.notFound.title)}</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${ctx.siteUrl}assets/icon.svg" type="image/svg+xml">
<script>(function(){try{var t=localStorage.getItem("yanfield-site-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}})()</script>
<style>${css}</style>
</head>
<body class="nf"><main class="wrap nf-in">${iconSvg}${block("zh")}${block("en")}</main></body>
</html>
`
}
