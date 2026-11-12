/**
 * GET /api/providers/harness
 * 列出 DSH 宿主里可用的模型路由（账号登录 / 官方 API Key）与各自能用的模型，
 * 供「模型服务」页做路由切换与模型同步。
 */
import { handle, ok } from "@/lib/api-utils";
import { getHarnessBridge } from "@/lib/ai/harness-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const bridge = getHarnessBridge();
  if (!bridge) {
    return ok({ routes: [], current: null, defaultModel: null });
  }
  const routes = typeof bridge.listRoutes === "function" ? await bridge.listRoutes() : [];
  return ok({
    routes,
    current: `harness:${bridge.providerRoute()}`,
    defaultModel: bridge.defaultModel(),
  });
});
