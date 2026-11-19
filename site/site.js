(function () {
  "use strict"
  var root = document.documentElement
  var $ = function (sel, el) { return (el || document).querySelector(sel) }
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)) }
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)")
  var store = {
    get: function (k) { try { return localStorage.getItem(k) } catch (e) { return null } },
    set: function (k, v) { try { localStorage.setItem(k, v) } catch (e) {} },
  }

  // theme
  var themeBtn = $("[data-theme-toggle]")
  function isDark() {
    return root.dataset.theme ? root.dataset.theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches
  }
  function syncTheme() {
    if (!themeBtn) return
    var dark = isDark()
    themeBtn.setAttribute("aria-label", dark ? themeBtn.dataset.lPaper : themeBtn.dataset.lNight)
    themeBtn.setAttribute("aria-pressed", String(dark))
  }
  if (themeBtn) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncTheme)
    themeBtn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark"
      root.dataset.theme = next
      store.set("yanfield-site-theme", next)
      syncTheme()
    })
    syncTheme()
  }

  // language: the switch is a plain link; remember the choice and keep the hash
  $$("[data-lang]").forEach(function (a) {
    a.addEventListener("click", function () {
      store.set("yanfield-site-lang", a.dataset.lang)
      var target = a.getAttribute("href").split("#")[0]
      if (location.hash) { a.setAttribute("href", target + location.hash) }
    })
  })

  // header state, mobile menu, scrollspy
  var top = $("[data-top]")
  var nav = $("[data-nav]")
  var menu = $("[data-menu]")
  function onScroll() { if (top) top.classList.toggle("is-stuck", window.scrollY > 8) }
  window.addEventListener("scroll", onScroll, { passive: true })
  onScroll()
  function setMenu(open, focusBtn) {
    if (!menu || !nav) return
    nav.classList.toggle("is-open", open)
    menu.setAttribute("aria-expanded", String(open))
    menu.setAttribute("aria-label", open ? menu.dataset.lClose : menu.dataset.lOpen)
    if (!open && focusBtn) menu.focus()
  }
  if (menu && nav) {
    menu.addEventListener("click", function () { setMenu(menu.getAttribute("aria-expanded") !== "true") })
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false) })
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") setMenu(false, true)
    })
    window.matchMedia("(min-width: 901px)").addEventListener("change", function () { setMenu(false) })
  }
  if ("IntersectionObserver" in window && nav) {
    var links = {}
    $$("a", nav).forEach(function (a) { links[a.getAttribute("href").slice(1)] = a })
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return
        Object.keys(links).forEach(function (k) { links[k].classList.toggle("is-on", k === en.target.id) })
        Object.keys(links).forEach(function (k) { if (k === en.target.id) links[k].setAttribute("aria-current", "true"); else links[k].removeAttribute("aria-current") })
      })
    }, { rootMargin: "-40% 0px -55% 0px" })
    Object.keys(links).forEach(function (k) { var s = document.getElementById(k); if (s) spy.observe(s) })
  }

  // reveal on scroll
  var rv = $$(".rv")
  if ("IntersectionObserver" in window && !reduce.matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target) } })
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 })
    rv.forEach(function (el) { io.observe(el) })
  } else {
    rv.forEach(function (el) { el.classList.add("in") })
  }

  // tabs (roving tabindex, arrow keys)
  $$("[data-tabs]").forEach(function (box) {
    var tabs = $$('[role="tab"]', box)
    var panels = $$('[role="tabpanel"]', box)
    if (!tabs.length) return
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab
        t.setAttribute("aria-selected", String(on))
        t.tabIndex = on ? 0 : -1
      })
      panels.forEach(function (p) { p.hidden = p.id !== tab.getAttribute("aria-controls") })
      if (focus) tab.focus()
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t) })
      t.addEventListener("keydown", function (e) {
        var n = null
        if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % tabs.length
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + tabs.length) % tabs.length
        else if (e.key === "Home") n = 0
        else if (e.key === "End") n = tabs.length - 1
        if (n === null) return
        e.preventDefault()
        select(tabs[n], true)
      })
    })
    select(tabs.filter(function (t) { return t.getAttribute("aria-selected") === "true" })[0] || tabs[0])
  })

  // hero preview: keep / revert one sample paragraph
  var mini = $("[data-mini]")
  if (mini) {
    var status = $("[data-mini-status]", mini)
    $$("[data-mini-act]", mini).forEach(function (b) {
      b.addEventListener("click", function () {
        var s = b.dataset.miniAct === "keep" ? "kept" : "reverted"
        mini.dataset.state = s
        status.textContent = mini.dataset["msg" + (s === "kept" ? "Kept" : "Reverted")]
        $$("[data-mini-act]", mini).forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)) })
      })
    })
  }

  // review demo
  var rev = $("[data-review]")
  if (rev) {
    var paras = $$("[data-para]", rev)
    var out = $("[data-out]", rev)
    var count = $("[data-count-out]", rev)
    var msg = $("[data-confirm-msg]", rev)
    var total = paras.length
    function text(p, state) {
      return $$("[data-seg]", p).filter(function (s) {
        var k = s.dataset.seg
        return k === "s" || (state === "keep" ? k === "i" : k === "d")
      }).map(function (s) { return s.textContent }).join("")
    }
    function render() {
      var done = 0
      out.textContent = ""
      paras.forEach(function (p) {
        var st = p.dataset.state
        if (st !== "pending") done++
        $$("[data-act]", p).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.act === st)) })
        var el = document.createElement("p")
        el.className = "out-p"
        el.dataset.s = st
        el.appendChild(document.createTextNode(text(p, st)))
        var tag = document.createElement("small")
        tag.textContent = rev.dataset[st === "keep" ? "tagKept" : st === "revert" ? "tagReverted" : "tagPending"]
        el.appendChild(tag)
        out.appendChild(el)
      })
      count.textContent = rev.dataset.count.replace("{n}", done).replace("{total}", total)
    }
    function setAll(state) { paras.forEach(function (p) { p.dataset.state = state }); msg.textContent = ""; render() }
    paras.forEach(function (p) {
      $$("[data-act]", p).forEach(function (b) {
        b.addEventListener("click", function () { p.dataset.state = b.dataset.act; msg.textContent = ""; render() })
      })
    })
    $$("[data-all]", rev).forEach(function (b) { b.addEventListener("click", function () { setAll(b.dataset.all) }) })
    $("[data-reset]", rev).addEventListener("click", function () { setAll("pending") })
    $("[data-confirm]", rev).addEventListener("click", function () { msg.textContent = rev.dataset.confirmed })
    render()
  }

  // copy install command, with an explicit error state
  var status2 = $("[data-copy-status]")
  function fallbackCopy(text, node) {
    var ok = false
    var ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    try {
      ta.select()
      ok = document.execCommand("copy")
    } catch (e) {
      ok = false
    } finally {
      document.body.removeChild(ta)
    }
    if (!ok && node) {
      var r = document.createRange()
      r.selectNodeContents(node)
      var sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    }
    return ok
  }
  $$("[data-copy]").forEach(function (btn) {
    var timer
    btn.addEventListener("click", function () {
      var text = btn.dataset.text
      var node = document.getElementById(btn.dataset.copy)
      function done(ok) {
        clearTimeout(timer)
        status2.classList.toggle("is-error", !ok)
        status2.textContent = ok ? btn.dataset.lDone : btn.dataset.lFail
        btn.dataset.state = ok ? "done" : "error"
        btn.textContent = ok ? btn.dataset.lDone : btn.dataset.lCopy
        timer = setTimeout(function () {
          btn.removeAttribute("data-state")
          btn.textContent = btn.dataset.lCopy
          if (ok) status2.textContent = ""
        }, 2400)
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { done(true) }, function () { done(fallbackCopy(text, node)) })
      } else {
        done(fallbackCopy(text, node))
      }
    })
  })

  // subtle pointer parallax on the hero layers
  var art = $("[data-parallax]")
  if (art && window.matchMedia("(hover: hover) and (min-width: 1001px)").matches && !reduce.matches) {
    var layers = $$("[data-depth]", art)
    art.parentNode.addEventListener("pointermove", function (e) {
      var r = art.getBoundingClientRect()
      var x = (e.clientX - r.left) / r.width - 0.5
      var y = (e.clientY - r.top) / r.height - 0.5
      layers.forEach(function (l) {
        var d = parseFloat(l.dataset.depth)
        l.style.transform = "translate3d(" + (x * d).toFixed(2) + "px," + (y * d).toFixed(2) + "px,0)"
      })
    })
    art.parentNode.addEventListener("pointerleave", function () { layers.forEach(function (l) { l.style.transform = "" }) })
  }
})()
