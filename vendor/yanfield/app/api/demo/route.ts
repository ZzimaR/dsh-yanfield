import { bad, handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { readOptionalBody } from "@/app/api/_lib/http";
import { resetDemo, seedDemo } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (request) => {
  const body = await readOptionalBody(request);
  const reset = body.reset === true || body.reset === "true";
  if (!reset) return ok(seedDemo(), { status: 201 });

  const { novelId } = resetDemo();
  const novel = repo.getNovel(novelId);
  if (!novel) return bad("示例作品创建失败", 500);
  return ok(novel, { status: 201 });
});
