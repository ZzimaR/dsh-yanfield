import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Chapter } from "@/lib/types";
import { pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MOVE_FIELDS: FieldSpec = { volumeId: "str|null", orderIndex: "num" };

export const POST = handle<{ id: string }>(async (request, { params }) => {
  const current = repo.getChapter(params.id);
  if (!current) return notFound("章节不存在");
  const body = await readBody(request);
  const input = pickFields<Chapter>(body, MOVE_FIELDS);
  if (typeof input.volumeId === "string") {
    const volume = repo.getVolume(input.volumeId);
    if (!volume || volume.novelId !== current.novelId) return bad("卷不存在或不属于该作品");
  }
  return ok(repo.moveChapter(params.id, { volumeId: input.volumeId, orderIndex: input.orderIndex }));
});
