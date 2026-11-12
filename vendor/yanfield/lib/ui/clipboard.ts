/** Clipboard API requires a secure context; LAN HTTP needs the selection fallback. */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* Fall back to the browser selection API. */ }
  const active = document.activeElement as HTMLElement | null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({length: selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const area = document.createElement("textarea");
  area.value = text;
  area.style.cssText = "position:fixed;left:-9999px;top:0;";
  document.body.appendChild(area);
  try {
    area.focus(); area.select();
    if (!document.execCommand("copy")) throw new Error("复制失败");
  } finally {
    area.remove(); active?.focus();
    selection?.removeAllRanges(); ranges.forEach(range => selection?.addRange(range));
  }
}
