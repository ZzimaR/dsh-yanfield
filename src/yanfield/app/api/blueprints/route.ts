import { handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { requireQueryParam } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 全书章纲列表。
 * 写作台的章纲面板要按卷扫读每一章的摘要与节奏标记；逐章请求会打成几十个并发 GET，
 * 这里一次返回，前端按 chapterId 建索引。没有章纲的章节不会出现在列表里。
 */
export const GET = handle(async (request) => {
  const novelId = requireQueryParam(request, "novelId", "novelId");
  // 列表端点对父资源缺失保持宽松：删掉的作品返回空列表而不是 404
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  return ok({ items: repo.listBlueprints(novelId) });
});
