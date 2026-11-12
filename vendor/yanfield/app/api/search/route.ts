import { handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { queryParam } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (request) => {
  const q = queryParam(request, "q")?.trim() ?? "";
  return ok({ items: q ? repo.search(q) : [] });
});
