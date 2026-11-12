import { handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import type { VolumeOutline } from "@/lib/types";
import { pickFields, readBody, type FieldSpec } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOLUME_OUTLINE_FIELDS: FieldSpec = {
  summary: "str",
  arcGoal: "str",
  keyEvents: "str[]",
  foreshadowPlan: "str[]",
};

export const GET = handle<{ volumeId: string }>(async (_request, { params }) => {
  if (!repo.getVolume(params.volumeId)) return notFound("卷不存在");
  return ok(repo.getVolumeOutline(params.volumeId));
});

export const PATCH = handle<{ volumeId: string }>(async (request, { params }) => {
  if (!repo.getVolume(params.volumeId)) return notFound("卷不存在");
  const body = await readBody(request);
  const patch = pickFields<VolumeOutline>(body, VOLUME_OUTLINE_FIELDS);
  return ok(repo.saveVolumeOutline(params.volumeId, patch));
});
