import { redirect } from "next/navigation";

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** 旧的大纲页：写作台已内置左栏「章纲」，这里只做跳转，保持旧链接可用 */
export default async function OutlinePage({
  params,
  searchParams,
}: {
  params: Promise<{ novelId: string }>;
  searchParams: Promise<{ chapter?: string | string[]; chapterId?: string | string[] }>;
}) {
  const { novelId } = await params;
  const search = await searchParams;
  const chapterId = firstParam(search.chapter) ?? firstParam(search.chapterId);
  const query = new URLSearchParams({ tab: "outline" });
  if (chapterId) query.set("chapterId", chapterId);
  redirect(`/editor/${novelId}?${query.toString()}`);
}
