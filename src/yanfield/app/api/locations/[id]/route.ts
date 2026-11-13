import { LOCATION_FIELDS } from "@/app/api/_lib/location-fields";
import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { LOCATION_KINDS, type Location } from "@/lib/types";
import { WORLD_IMPORTANCES, pickEnum, pickFields, readBody } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const place = repo.getLocation(params.id);
  if (!place) return notFound("地点不存在");
  return ok(place);
});

export const PATCH = handle<{ id: string }>(async (request, { params }) => {
  const body = await readBody(request);
  const current = repo.getLocation(params.id);
  if (!current) return notFound("地点不存在");
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== current.updatedAt) return bad("资料已有新修改，请重新打开并核对后保存", 409);
  const patch = pickFields<Location>(body, LOCATION_FIELDS);
  const kind = pickEnum(body, "kind", LOCATION_KINDS, "地点类型");
  if (kind) patch.kind = kind;
  const importance = pickEnum(body, "importance", WORLD_IMPORTANCES, "重要程度");
  if (importance) patch.importance = importance;
  if (typeof patch.name === "string") {
    patch.name = patch.name.trim();
    if (!patch.name) return bad("地点名不能为空");
  }
  if (patch.parentId !== undefined) {
    const parent = repo.locationParentError(patch.parentId, current.novelId, params.id);
    if (parent) return bad(parent);
  }
  if (Object.keys(patch).length === 0) return bad("没有可更新的字段");
  return ok(repo.updateLocation(params.id, patch));
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getLocation(params.id)) return notFound("地点不存在");
  repo.deleteLocation(params.id);
  return ok({ ok: true });
});
