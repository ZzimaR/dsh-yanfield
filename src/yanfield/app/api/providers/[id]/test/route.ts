import { handle, notFound, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { testProvider } from "@/lib/ai/provider";
import { optionalString, readOptionalBody } from "@/app/api/_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle<{ id: string }>(async (request, { params }) => {
  const provider = repo.getProvider(params.id);
  if (!provider) return notFound("模型服务不存在");

  const body = await readOptionalBody(request);
  const model = optionalString(body, "model")?.trim() || provider.models[0]?.id;
  const result = await testProvider(provider, model);
  return ok(result);
});
