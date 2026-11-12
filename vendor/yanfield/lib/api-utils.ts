import { NextResponse } from "next/server";
import { ensureReady } from "./seed";

/** 业务错误：带 HTTP 状态码，handle() 会原样返回给客户端 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function notFound(message = "资源不存在"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.text();
    if (!body) return {} as T;
    return JSON.parse(body) as T;
  } catch {
    throw new ApiError("请求体不是合法 JSON", 400);
  }
}

export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

type Handler<P> = (req: Request, ctx: { params: P }) => Promise<Response> | Response;

/**
 * 统一包装 Route Handler：自动 ensureReady（首次请求时初始化数据库/示例数据）、
 * 参数解析与错误处理。
 *
 * `export const GET = handle<{ id: string }>(async (req, { params }) => { ... })`
 */
export function handle<P extends Record<string, string> = Record<string, string>>(fn: Handler<P>) {
  // 注意：第二参必须声明为必填且形如 Next 的 RouteContext，
  // 否则 next 生成的类型校验（.next/types）会报 ParamCheck 错误。
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      ensureReady();
      const params = (ctx && ctx.params ? await ctx.params : ({} as Record<string, string>)) as P;
      return await fn(req, { params });
    } catch (err) {
      if (err instanceof ApiError) return bad(err.message, err.status);
      console.error("[yanfield] route error:", err);
      return bad(err instanceof Error ? err.message : "服务器内部错误", 500);
    }
  };
}
