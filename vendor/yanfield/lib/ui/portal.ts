/** 浮层挂在插件自己的节点上，样式留在 Shadow DOM 里，不铺到 Harness 页面。 */
let portal: HTMLElement | null = null

export function setYanfieldPortal(next: HTMLElement | null): void {
  portal = next
}

export function yanfieldPortal(): HTMLElement {
  if (portal && portal.isConnected) return portal
  return document.body
}
