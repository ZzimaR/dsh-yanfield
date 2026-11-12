import { bad, handle, ok } from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import { readBody } from "@/app/api/_lib/http";
import { buildSettingsPatch } from "@/app/api/_lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  return ok(repo.getSettings());
});

export const PATCH = handle(async (request) => {
  const body = await readBody(request);
  const current = repo.getSettings();
  const patch = buildSettingsPatch(current, body);
  if (Object.keys(patch).length === 0) return bad("没有可更新的设置字段");
  return ok(repo.saveSettings(patch));
});
