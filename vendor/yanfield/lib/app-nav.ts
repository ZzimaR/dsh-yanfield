/**
 * 作品内的「返回」只走上一层：
 * 概览 → 书架；大纲 / 设定 / 档案 / 写作 → 概览。
 */
export function novelBackTarget(pathname: string, novelId: string): { href: string; label: string } {
  const overview = `/novel/${novelId}`;
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (normalized === overview) return { href: "/library", label: "返回书架" };
  return { href: overview, label: "返回概览" };
}
