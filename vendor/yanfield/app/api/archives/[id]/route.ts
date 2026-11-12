import { handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ id: string }>(async (_request, { params }) => {
  const archive = repo.getArchive(params.id);
  if (!archive) return notFound("档案不存在");
  return ok(archive);
});

export const DELETE = handle<{ id: string }>(async (_request, { params }) => {
  if (!repo.getArchive(params.id)) return notFound("档案不存在");
  repo.deleteArchive(params.id);
  return ok({ ok: true });
});
