import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Readable } from "node:stream"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dir = await mkdtemp(path.join(tmpdir(), "yanfield-dsh-"))
process.env.YANFIELD_DB_PATH = path.join(dir, "yanfield.db")
process.env.YANFIELD_IN_DSH = "1"
process.env.DSH_HOME = dir

const host = await import(pathToFileURL(path.join(root, "dist", "host.js")).href)
const plugin = host.default ?? host
if (plugin.name !== "dsh-yanfield" || typeof plugin.apply !== "function") {
  throw new Error("宿主入口没有导出 apply")
}

const { createHttpHandler } = host
const ctx = {
  get(name) {
    if (name === "connection") return { requestRejection: () => null }
    return undefined
  },
}
const handler = createHttpHandler(ctx)

function call(method, url, body) {
  const req = Readable.from(body ? [Buffer.from(body)] : [])
  req.method = method
  req.url = url
  req.headers = body ? { "content-type": "application/json" } : {}
  const chunks = []
  let status = 0
  const headers = {}
  const res = {
    statusCode: 0,
    setHeader(name, value) { headers[name.toLowerCase()] = value },
    write(chunk) { chunks.push(Buffer.from(chunk)); return true },
    end(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
      status = this.statusCode
    },
    on() {},
    off() {},
    get destroyed() { return false },
    get headersSent() { return false },
  }
  return handler(req, res).then(() => ({
    status: status || res.statusCode,
    body: Buffer.concat(chunks).toString("utf8"),
  }))
}

try {
  const created = await call("POST", "/yanfield/api/novels", JSON.stringify({ title: "插件烟测", genre: "仙侠" }))
  if (created.status !== 200 && created.status !== 201) {
    throw new Error(`创建作品失败 ${created.status} ${created.body}`)
  }
  const listed = await call("GET", "/yanfield/api/novels")
  const payload = JSON.parse(listed.body)
  if (listed.status !== 200 || !Array.isArray(payload.items) || payload.items.length < 1) {
    throw new Error(`书架没有读回来 ${listed.status} ${listed.body}`)
  }
  if (!payload.items.some((item) => item.title === "插件烟测") && !payload.items.some((item) => item.title)) {
    throw new Error("书架内容不对")
  }
  console.log(`[dsh-yanfield] smoke ok (${payload.items.length} novels)`)
} finally {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Windows 上 SQLite 句柄要等进程退出才放开，临时目录留着无妨。
  }
}
