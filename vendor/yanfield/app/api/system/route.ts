import path from "node:path";
import { version } from "@/package.json";
import type { SystemInfo } from "@/lib/types";
import { ApiError, handle, ok } from "@/lib/api-utils";
import { getDbPath, SCHEMA_VERSION } from "@/lib/db";
import { openFolder } from "@/app/api/_lib/open-folder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function systemInfo(): SystemInfo {
  const dbPath = getDbPath();
  return {
    version,
    schemaVersion: SCHEMA_VERSION,
    dbPath,
    dataDir: path.dirname(dbPath),
    customDbPath: Boolean(process.env.YANFIELD_DB_PATH?.trim()),
  };
}

export const GET = handle(async () => ok(systemInfo()));

export const POST = handle(async (request) => {
  // 只接受 JSON：跨站网页发不出不经 CORS 预检的 JSON 请求，避免被外部页面随意触发。
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError("需要 JSON 请求", 415);
  }
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "open-data-dir") throw new ApiError("不支持的操作");
  const { dataDir } = systemInfo();
  try {
    await openFolder(dataDir);
  } catch {
    throw new ApiError(`无法在这台机器上打开文件夹，请手动前往：${dataDir}`, 500);
  }
  return ok({ opened: dataDir });
});
