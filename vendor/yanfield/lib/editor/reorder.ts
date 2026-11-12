/**
 * 同列表拖拽：insertAt 是「含末尾」的插入点（0..length）。
 * 返回值是「先把该项取出、再插入」后的 orderIndex；落回原位时返回 null。
 */
export function sameListOrderIndex(from: number, insertAt: number): number | null {
  if (from < 0) return null;
  if (insertAt === from || insertAt === from + 1) return null;
  return from < insertAt ? insertAt - 1 : insertAt;
}
