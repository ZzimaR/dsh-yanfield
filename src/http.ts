import { routes } from "./generated/routes.js"

interface RouteModule {
  [method: string]: unknown
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const

interface NodeRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>
}

interface NodeResponse {
  statusCode: number
  setHeader: (name: string, value: string | number | readonly string[]) => void
  getHeader?: (name: string) => unknown
  write: (chunk: Uint8Array) => boolean
  end: (chunk?: Uint8Array | string) => void
  on: (event: string, listener: () => void) => void
  once?: (event: string, listener: () => void) => void
  off?: (event: string, listener: () => void) => void
  headersSent?: boolean
  destroyed?: boolean
  flushHeaders?: () => void
}

interface CompiledRoute {
  pattern: string
  keys: string[]
  regex: RegExp
  score: number
  handlers: RouteModule & Record<string, unknown>
}

const compiled: CompiledRoute[] = routes
  .map((route) => {
    const keys: string[] = []
    const source = route.pattern
      .split("/")
      .map((part) => {
        if (part.startsWith(":")) {
          keys.push(part.slice(1))
          return "([^/]+)"
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      })
      .join("/")
    const score = route.pattern.split("/").filter((part) => part && !part.startsWith(":")).length * 10 + route.pattern.length
    return { pattern: route.pattern, keys, regex: new RegExp(`^${source}$`), score, handlers: route.handlers }
  })
  .sort((a, b) => b.score - a.score)

function rejection(ctx: { get?: (name: string) => unknown }, req: NodeRequest): number | null {
  try {
    const connection = ctx.get?.("connection") as { requestRejection?: (input: { headers: NodeRequest["headers"] }) => number | null | undefined } | undefined
    if (!connection || typeof connection.requestRejection !== "function") return 403
    const status = connection.requestRejection({ headers: req.headers })
    return status ? status : null
  } catch {
    return 403
  }
}

function json(res: NodeResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("cache-control", "no-store")
  res.setHeader("content-length", Buffer.byteLength(text))
  res.end(text)
}

async function readBody(req: NodeRequest): Promise<Buffer> {
  if (!req[Symbol.asyncIterator]) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 32 * 1024 * 1024) {
      throw Object.assign(new Error("请求体过大"), { status: 413 })
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function headersOf(req: NodeRequest): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }
  return headers
}

async function writeWebResponse(res: NodeResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    if (key === "transfer-encoding" || key === "content-length") return
    res.setHeader(key, value)
  })
  if (!response.body) {
    res.end()
    return
  }
  if (typeof res.flushHeaders === "function") res.flushHeaders()
  const reader = response.body.getReader()
  const cancel = () => {
    reader.cancel().catch(() => undefined)
  }
  res.on("close", cancel)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        if (!res.destroyed) res.end()
        return
      }
      if (res.destroyed) return
      const chunk = Buffer.from(value)
      if (!res.write(chunk)) {
        await new Promise<void>((resolve) => {
          if (typeof res.once === "function") res.once("drain", resolve)
          else res.on("drain", resolve)
        })
      }
    }
  } finally {
    res.off?.("close", cancel)
  }
}

export async function handleHttp(
  ctx: { get?: (name: string) => unknown },
  req: NodeRequest,
  res: NodeResponse,
  prefix: string,
): Promise<void> {
  const denied = rejection(ctx, req)
  if (denied) {
    json(res, denied, { error: "未授权" })
    return
  }
  const url = new URL(req.url || "/", "http://yanfield.local")
  const pathname = url.pathname.replace(new RegExp(`^${prefix}`), "") || "/"
  const method = (req.method || "GET").toUpperCase()
  const match = compiled.find((route) => route.regex.test(pathname))
  if (!match) {
    json(res, 404, { error: `接口不存在：${method} ${pathname}` })
    return
  }
  const found = pathname.match(match.regex)
  const params: Record<string, string> = {}
  try {
    match.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(found?.[index + 1] || "")
    })
  } catch (error) {
    if (!(error instanceof URIError)) throw error
    json(res, 400, { error: "URL 路径编码无效" })
    return
  }
  const handlers = match.handlers as Record<string, (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response> | Response>
  const handler = handlers[method]
  if (typeof handler !== "function") {
    json(res, 405, { error: `${method} 不被这个接口支持` })
    return
  }
  const controller = new AbortController()
  const onClose = () => controller.abort()
  res.on("close", onClose)
  try {
    const hasBody = method !== "GET" && method !== "HEAD"
    const body = hasBody ? await readBody(req) : undefined
    const request = new Request(url, {
      method,
      headers: headersOf(req),
      body: body && body.length > 0 ? body : undefined,
      signal: controller.signal,
    })
    const response = await handler(request, { params: Promise.resolve(params) })
    if (res.headersSent || res.destroyed) return
    await writeWebResponse(res, response)
  } catch (error) {
    if (res.headersSent || res.destroyed) return
    const status = typeof (error as { status?: number }).status === "number" ? (error as { status: number }).status : 500
    const message = error instanceof Error ? error.message : "服务器内部错误"
    json(res, status, { error: message })
  } finally {
    res.off?.("close", onClose)
  }
}

void METHODS
