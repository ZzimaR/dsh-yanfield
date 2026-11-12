import { handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  return ok(repo.getStats());
});
