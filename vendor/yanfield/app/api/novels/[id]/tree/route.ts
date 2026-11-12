import { handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const search = new URL(_request.url).searchParams;
  const tree = repo.getNovelTree(params.id, search.get("view") !== "summary");
  if (!tree) return notFound("作品不存在");
  const chapterId = search.get("chapterId");
  if (chapterId) {
    const containsChapter =
      tree.volumes.some((volume) => volume.chapters.some((chapter) => chapter.id === chapterId)) ||
      tree.looseChapters.some((chapter) => chapter.id === chapterId);
    const selectedChapter = containsChapter ? repo.getChapter(chapterId) : undefined;
    return ok({
      ...tree,
      selectedChapter: selectedChapter?.novelId === params.id ? selectedChapter : null,
    });
  }
  return ok(tree);
});
