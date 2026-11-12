/**
 * shadow DOM 里的「点击外部」判断。
 *
 * 插件把砚田整个界面挂在 shadow root 里，而 `document` 上的 pointerdown /
 * mousedown 监听收到的是跨过 shadow 边界后的重定向事件：`event.target` 会变成
 * shadow host，于是 `menuRef.current.contains(event.target)` 恒为 false，
 * 点菜单里的选项也会被当成「点了外部」——下拉菜单一点就关、选不中值。
 *
 * `event.composedPath()` 保留事件在 shadow 树里的真实路径，所以统一用它判断。
 * 非 shadow 场景（composedPath 为空或不可用）回退到 contains。
 */
export function isInsideComposedPath(
  event: Event,
  nodes: Array<Element | null | undefined>,
): boolean {
  const targets = nodes.filter(Boolean) as Element[];
  if (targets.length === 0) return false;
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (path.length > 0) return targets.some((node) => path.includes(node));
  const target = event.target as Node | null;
  return Boolean(target && targets.some((node) => node.contains(target)));
}
