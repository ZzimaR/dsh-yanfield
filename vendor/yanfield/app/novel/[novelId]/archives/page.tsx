import { redirect } from "next/navigation";

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 旧的档案页：写作台已内置左栏「档案」，这里只做跳转，保持旧链接可用。
 * 旧链接带 chapter 时保留，跳转后仍定位到对应章节。
 */
export default async function ArchivesPage({
  params,
  searchParams,
}: {
  params: Promise<{ novelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { novelId } = await params;
  const search = await searchParams;
  const query = new URLSearchParams({ tab: "archives" });
  const chapterId = firstParam(search.chapter) ?? firstParam(search.chapterId);
  if (chapterId) query.set("chapterId", chapterId);
  redirect(`/editor/${novelId}?${query.toString()}`);
}
