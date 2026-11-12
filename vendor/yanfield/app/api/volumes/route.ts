import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Volume } from "@/lib/types";
import {
  pickFields,
  readBody,
  requireQueryParam,
  requireString,
  type FieldSpec,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOLUME_FIELDS: FieldSpec = { title: "str", summary: "str", orderIndex: "num" };

export const GET = handle(async (request) => {
  const novelId = requireQueryParam(request, "novelId", "novelId");
  // 列表端点对父资源缺失保持宽松：级联删除后的陈旧请求返回空列表而不是 404
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  return ok({ items: repo.listVolumes(novelId) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");
  const input = pickFields<Volume>(body, VOLUME_FIELDS);
  if (typeof input.title === "string") {
    input.title = input.title.trim();
    if (!input.title) return bad("卷标题不能为空");
  }
  return ok(repo.createVolume(novelId, input), { status: 201 });
});
