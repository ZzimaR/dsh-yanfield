/**
 * 接口返回形状兼容层。
 * 契约允许成功响应是「对象本身」或「{ items: [...] }」，这里统一成数组 / 单对象，
 * 既避免写 any，也让 UI 在接口返回形状略有差异时不至于崩溃。
 */

export function toItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data !== null && typeof data === "object" && "items" in data) {
    const items = (data as { items: unknown }).items;
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

export function toOne<T>(data: unknown): T | null {
  if (data === null || data === undefined) return null;
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return data as T;
}
