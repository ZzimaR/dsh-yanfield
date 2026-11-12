import { redirect } from "next/navigation";

/** 旧设定页 tab 参数 → 写作台「设定」左栏内的聚焦分类 */
const FOCUS_BY_LEGACY_TAB: Record<string, string> = {
  characters: "characters",
  character: "characters",
  world: "world",
  worlds: "world",
  foreshadows: "foreshadows",
  foreshadow: "foreshadows",
};

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 旧的设定页：写作台已内置左栏「设定」，这里只做跳转，保持旧链接可用。
 * 旧链接会带 chapter（定位到某一章）和 tab=foreshadows（蓝图页「在设定页管理」），跳转时都不能丢。
 */
export default async function BiblePage({
  params,
  searchParams,
}: {
  params: Promise<{ novelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { novelId } = await params;
  const search = await searchParams;
  const query = new URLSearchParams({ tab: "codex" });
  const chapterId = firstParam(search.chapter) ?? firstParam(search.chapterId);
  if (chapterId) query.set("chapterId", chapterId);
  const focus = FOCUS_BY_LEGACY_TAB[firstParam(search.tab) ?? ""] ?? firstParam(search.focus);
  if (focus) query.set("focus", focus);
  redirect(`/editor/${novelId}?${query.toString()}`);
}
