import React, { useEffect, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import css from "./styles.generated.css"
import { applyUiFont, getStoredUiFont, setThemeRoots, syncSurfaceTheme } from "@/lib/ui/theme"
import { setYanfieldPortal } from "@/lib/ui/portal"
import {
  installLocaleBridge,
  normalizeLocale,
  t,
  useT,
} from "@/lib/i18n"
import { YanfieldApp } from "./app"

export const inject = ["slots", "locale"]

/** 侧栏只给 16px。用线条画田字格，跟宿主其他入口一样吃 currentColor。 */
function PanelIcon({ size = 16 }: { size?: number }) {
  return (
    <svg data-dsh-panel-entry="yanfield" viewBox="0 0 16 16" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.7" y="1.7" width="12.6" height="12.6" rx="3" />
      <path d="M8 1.7v12.6M1.7 8h12.6" strokeDasharray="1.5 1.2" />
    </svg>
  )
}

function RightTabTitle() {
  const tr = useT()
  return <span>{tr("砚田")}</span>
}

function RightTabBody({ openWorkbench }: { openWorkbench?: () => void }) {
  const tr = useT()
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, font: "inherit" }}>
      <strong style={{ fontSize: 13 }}>{tr("砚田")}</strong>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, opacity: 0.75 }}>
        {tr("长篇正文、大纲和资料在这里。AI 改动先给你看，确认后才写入。")}
      </p>
      <button
        type="button"
        onClick={() => openWorkbench?.()}
        style={{
          height: 30,
          border: 0,
          borderRadius: 8,
          background: "#366b9a",
          color: "#fff",
          cursor: "pointer",
          font: "inherit",
          fontSize: 12,
        }}
      >
        {tr("打开写作台")}
      </button>
    </div>
  )
}

function openPanel(ctx: { get?: (name: string) => unknown }) {
  try {
    const layout = ctx.get?.("layout") as { selectPanel?: (id: string) => void } | undefined
    if (layout && typeof layout.selectPanel === "function") {
      layout.selectPanel("yanfield")
      return true
    }
  } catch {
    /* 当前界面没有主面板 */
  }
  return false
}

/** Tailwind v4 把边框/阴影/环等工具类的初始值放在 `@property` 的 initial-value 里，
 *  而 Chrome 不会注册 shadow root 内声明的 `@property`（实测 Chrome 157），导致
 *  `border-style: var(--tw-border-style)` 无效、所有边框都不画。
 *  文档级注册的 property 对 shadow tree 生效，所以把 css 里的 @property 规则
 *  提升一份到 document.head（同名重复注册会被忽略，可安全重复执行）。 */
const AT_PROPERTY_RE = /@property\s+--[\w-]+\s*\{[^}]*\}/g

function registerAtProperties(cssText: string) {
  if (typeof document === "undefined") return
  if (document.querySelector("style[data-yanfield-at-properties]")) return
  const rules = cssText.match(AT_PROPERTY_RE)
  if (!rules || rules.length === 0) return
  const style = document.createElement("style")
  style.dataset.yanfieldAtProperties = ""
  style.textContent = rules.join("\n") + "\n"
  document.head.appendChild(style)
}

function Desk() {
  const hostRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    registerAtProperties(css)
    host.style.height = "100%"
    host.style.minHeight = "100%"
    const shadow = host.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = css
    const mount = document.createElement("div")
    mount.className = "yf-app"
    mount.style.height = "100%"
    mount.style.minHeight = "0"
    const portal = document.createElement("div")
    portal.className = "yf-portal"
    shadow.append(style, mount, portal)
    setThemeRoots([host, mount, portal])
    setYanfieldPortal(portal)
    // 跟随宿主主题：Harness 在 document.body 上标 data-ds-dark-theme，
    // 用户切换 Harness 的浅色/深色时插件要立刻跟着变。
    const syncTheme = () => syncSurfaceTheme()
    syncTheme()
    applyUiFont(getStoredUiFont(), false)
    const themeObserver = new MutationObserver(syncTheme)
    try {
      themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-ds-dark-theme", "data-ds-light-theme", "data-theme", "data-mode", "class"],
      })
    } catch {
      /* ignore */
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", syncTheme)
    let root: Root | null = null
    try {
      root = createRoot(mount)
      root.render(<YanfieldApp />)
    } catch (error) {
      mount.textContent = error instanceof Error ? error.message : t("砚田界面没有挂上")
    }
    return () => {
      themeObserver.disconnect()
      media.removeEventListener("change", syncTheme)
      root?.unmount()
      setYanfieldPortal(null)
      setThemeRoots([])
      shadow.replaceChildren()
    }
  }, [])
  return <div ref={hostRef} data-dsh-plugin="dsh-yanfield" style={{ height: "100%", minHeight: "100%" }} />
}

export function apply(ctx: {
  slots?: {
    inject: (key: string, register: () => unknown) => unknown
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  locale?: {
    getSnapshot: () => { active: string }
    subscribe: (listener: () => void) => () => void
  }
  effect?: (fn: () => void, label?: string) => void
  inject?: (deps: string[], fn: (scoped: { get?: (name: string) => unknown }) => (() => void) | void) => unknown
  get?: (name: string) => unknown
}) {
  const slots = ctx.slots
  const locale = ctx.locale ?? (ctx.get?.("locale") as typeof ctx.locale)
  const detachLocale = locale && typeof locale.getSnapshot === "function" && typeof locale.subscribe === "function"
    ? installLocaleBridge({
        getLocale: () => normalizeLocale(locale.getSnapshot().active),
        subscribe: (listener) => locale.subscribe(listener),
      })
    : null
  if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") {
    return () => detachLocale?.()
  }
  const disposers: Array<() => void> = detachLocale ? [detachLocale] : []
  const injectSlot = (key: string, register: () => unknown) => {
    try {
      const value = slots.inject(key, register)
      if (typeof value === "function") disposers.push(value as () => void)
    } catch {
      /* 这个槽位在当前版本不存在 */
    }
  }
  injectSlot("main", () => slots.register({ name: "main", key: "yanfield" }, Desk))
  injectSlot("sidebar.panellist", () => slots.register({
    name: "sidebar.panellist",
    id: "yanfield",
    order: 8,
    label: () => t("砚田"),
  }, PanelIcon))
  // 聊天页头不再放入口：砚田只保留左侧导航栏（sidebar.panellist）一个入口。
  try {
    if (typeof ctx.inject === "function") {
      const seat = ctx.inject(["sidebarRightTabs", "sidebarRight"], (injected) => {
        const tabs = injected.get?.("sidebarRightTabs") as { register?: (input: Record<string, unknown>) => (() => void) | void } | undefined
        const cleanups: Array<() => void> = []
        try {
          const dispose = tabs?.register?.({
            id: "dsh-yanfield:tab",
            kind: "yanfield",
            keepMounted: true,
            priority: "extension",
            title: () => t("砚田"),
          })
          if (typeof dispose === "function") cleanups.push(dispose)
        } catch {
          /* 右侧栏只是入口，失败不影响写作台 */
        }
        try {
          const openWorkbench = () => openPanel(ctx)
          const body = slots.inject("sidebar.right.pane.tab", () => slots.register({
            name: "sidebar.right.pane.tab",
            key: "dsh-yanfield:tab",
            inject: () => ({ openWorkbench }),
          }, RightTabBody))
          const title = slots.inject("sidebar.right.pane.tab.title", () => slots.register({
            name: "sidebar.right.pane.tab.title",
            key: "dsh-yanfield:tab",
            inject: () => ({}),
          }, RightTabTitle))
          if (typeof body === "function") cleanups.push(body as () => void)
          if (typeof title === "function") cleanups.push(title as () => void)
        } catch {
          /* 右侧栏槽位不存在 */
        }
        return () => {
          for (const fn of cleanups.splice(0).reverse()) {
            try { fn() } catch { /* ignore */ }
          }
        }
      })
      if (typeof seat === "function") disposers.push(seat as () => void)
    }
  } catch {
    /* 没有右侧栏 */
  }
  return () => {
    for (const fn of disposers.splice(0)) {
      try { fn() } catch { /* ignore */ }
    }
  }
}

export default { inject, apply }
