/** 浮层挂在插件自己的节点上，样式留在 Shadow DOM 里，不铺到 Harness 页面。 */
let portal: HTMLElement | null = null

export function setYanfieldPortal(next: HTMLElement | null): void {
  portal = next
}

export function yanfieldPortal(): HTMLElement {
  if (portal && portal.isConnected) return portal
  return document.body
}

export interface PanelBounds {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 宿主里的插件面板所占的矩形（视口坐标）。
 * 浮层是 `position: fixed` 的，直接 `inset-0` 会铺满整个 Harness 窗口；
 * 用面板矩形当浮层的边界，弹窗才会在面板内居中、遮罩也不会盖住宿主侧栏。
 */
export function yanfieldPanelBounds(): PanelBounds | null {
  const host = yanfieldPanelElement()
  if (!host) return null
  const rect = host.getBoundingClientRect()
  if (rect.width < 80 || rect.height < 80) return null
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

export function yanfieldPanelElement(): HTMLElement | null {
  if (typeof window === "undefined") return null
  const node = yanfieldPortal()
  const root = node.getRootNode()
  const host =
    root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : node === document.body ? null : node
  return host?.isConnected ? host : null
}
