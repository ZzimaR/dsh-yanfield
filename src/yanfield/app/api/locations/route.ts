import { LOCATION_FIELDS } from "@/app/api/_lib/location-fields";
import { bad, handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { LOCATION_KINDS, type Location } from "@/lib/types";
import {
  WORLD_IMPORTANCES,
  pickEnum,
  pickFields,
  queryParam,
  readBody,
  requireString,
} from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (request) => {
  const novelId = queryParam(request, "novelId");
  if (!novelId) return bad("缺少查询参数 novelId");
  if (!repo.getNovel(novelId)) return ok({ items: [] });
  return ok({ items: repo.listLocations(novelId) });
});

export const POST = handle(async (request) => {
  const body = await readBody(request);
  const novelId = requireString(body, "novelId", "novelId");
  if (!repo.getNovel(novelId)) return notFound("作品不存在");
  const name = requireString(body, "name", "地点名");
  const input = pickFields<Location>(body, LOCATION_FIELDS);
  const kind = pickEnum(body, "kind", LOCATION_KINDS, "地点类型");
  if (kind) input.kind = kind;
  const importance = pickEnum(body, "importance", WORLD_IMPORTANCES, "重要程度");
  if (importance) input.importance = importance;
  const parent = repo.locationParentError(input.parentId, novelId);
  if (parent) return bad(parent);
  return ok(repo.createLocation(novelId, { ...input, name }), { status: 201 });
});
