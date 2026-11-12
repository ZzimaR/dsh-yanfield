import { bad, handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { readBody } from "@/app/api/_lib/http";
import { buildSettingsPatch } from "@/app/api/_lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  // aiPricing 返回「实际生效」的单价：用户没填时用内置 DeepSeek 官方价目表，
  // 这样客户端算出来的费用是「预估 ¥x」而不是「费用未知」。
  return ok({ ...repo.getSettings(), aiPricing: repo.getEffectiveAiPricing() });
});

export const PATCH = handle(async (request) => {
  const body = await readBody(request);
  const current = repo.getSettings();
  const patch = buildSettingsPatch(current, body);
  if (Object.keys(patch).length === 0) return bad("没有可更新的设置字段");
  const saved = repo.saveSettings(patch);
  return ok({ ...saved, aiPricing: repo.getEffectiveAiPricing(saved) });
});
