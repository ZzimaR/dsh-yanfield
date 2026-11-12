/** 让砚田原来的 Route Handler 在没有 Next.js 的宿主里继续返回 JSON。 */
export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers)
    if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8")
    return new NextResponse(JSON.stringify(data), { ...init, headers })
  }
}
