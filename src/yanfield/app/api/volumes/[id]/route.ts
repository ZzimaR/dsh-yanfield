import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { Volume } from "@/lib/types";
import { pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOLUME_FIELDS: FieldSpec = { title: "str", summary: "str", orderIndex: "num" };

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const volume = repo.getVolume(params.id);
  if (!volume) return notFound("卷不存在");
  return ok(volume);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  if (!repo.getVolume(params.id)) return notFound("卷不存在");
  const body = await readBody(request);
  const patch = pickFields<Volume>(body, VOLUME_FIELDS);
  if (typeof patch.title === "string") {
    patch.title = patch.title.trim();
    if (!patch.title) return bad("卷标题不能为空");
  }
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");
  return ok(repo.updateVolume(params.id, patch));
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getVolume(params.id)) return notFound("卷不存在");
  repo.deleteVolume(params.id);
  return ok({ ok: true });
});
