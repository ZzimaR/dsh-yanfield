import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { Readable } from "node:stream"
import assert from "node:assert/strict"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dir = await mkdtemp(path.join(tmpdir(), "yanfield-dsh-"))
const dbPath = path.join(dir, "custom.db")
process.env.YANFIELD_DB_PATH = dbPath
process.env.DSH_HOME = dir
delete process.env.DEEPSEEK_API_KEY

const host = await import(pathToFileURL(path.join(root, "dist", "host.js")).href)
const plugin = host.default ?? host
if (plugin.name !== "dsh-yanfield" || typeof plugin.apply !== "function") {
  throw new Error("宿主入口没有导出 apply")
}

let modelWindow = 32000
const outputLimits = []
const ctx = {
  get(name) {
    if (name === "connection") return { requestRejection: () => null }
    if (name === "credentials") return { resolve: async () => ({ value: "smoke-fixture" }) }
    return undefined
  },
  deepseekAccount: { getState: async () => ({ status: "signed-out" }) },
  llm: {
    listProviders: () => [{ id: "deepseek-account" }, { id: "deepseek-official" }],
    listModels: async () => [{ id: "deepseek-flash", label: "烟测模型", contextWindow: modelWindow }],
    async *stream({ maxTokens }) {
      outputLimits.push(maxTokens)
      if (outputLimits.length === 1) {
        yield { type: "usage", usage: { inputTokens: 2000, outputTokens: 1400 } }
        yield { type: "finish", reason: { kind: "max-tokens" } }
        return
      }
      yield { type: "text-delta", text: '{"message":"完成","calls":[],"done":true}' }
      yield { type: "usage", usage: { inputTokens: 2100, outputTokens: 100 } }
      yield { type: "finish", reason: { kind: "stop" } }
    },
  },
}
plugin.apply(ctx)
let handler = host.createHttpHandler(ctx)

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
  const novel = payload.items.find((item) => item.title === "插件烟测")
  assert.ok(novel, "书架应包含新建作品")

  async function api(method, route, body) {
    const result = await call(method, `/yanfield/api${route}`, body === undefined ? undefined : JSON.stringify(body))
    return { ...result, data: JSON.parse(result.body) }
  }

  const { data: system } = await api("GET", "/system")
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
  assert.equal(system.dbPath, dbPath)
  assert.equal(system.version, manifest.version)
  assert.equal((await api("GET", "/novels/%ZZ")).status, 400)
  const providers = await api("GET", "/providers")
  const harness = providers.data.items.find((item) => item.kind === "harness")
  assert.equal(harness.baseUrl, "harness:deepseek-official", "首次初始化应选择有凭据的路由")
  assert.equal(harness.models[0].contextWindow, 32000)
  modelWindow = 64000
  const synced = (await api("GET", "/providers")).data.items.find((item) => item.id === harness.id)
  assert.equal(synced.models[0].contextWindow, 64000)

  assert.equal((await api("PATCH", "/settings", { defaultContext: { contextBudget: 12000 } })).status, 200)
  assert.equal((await api("PATCH", "/settings", { defaultContext: { contextBudget: 2000001 } })).status, 400)
  const restarted = await import(`${pathToFileURL(path.join(root, "dist", "host.js")).href}?restart`)
  restarted.apply(ctx)
  handler = restarted.createHttpHandler(ctx)
  assert.equal((await api("GET", "/settings")).data.defaultContext.contextBudget, 12000)
  assert.equal((await api("GET", "/providers/harness")).data.current, "harness:deepseek-official")

  async function runAgent(maxTokens) {
    const result = await call("POST", "/yanfield/api/ai/agent", JSON.stringify({
      novelId: novel.id, message: "烟测任务", context: { maxTokens },
    }))
    assert.equal(result.status, 200)
    return result.body.split(/\r?\n/).filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6))).findLast((event) => event.type === "done")?.usage
  }
  const usage = await runAgent(3000)
  assert.deepEqual(outputLimits, [1400, 3000])
  assert.equal(usage.totalTokens, 5600, "输出截断的第一次调用也应计入用量")
  await runAgent(1000)
  assert.deepEqual(outputLimits, [1400, 3000, 1000])
  console.log(`[dsh-yanfield] smoke ok (${payload.items.length} novels, settings restart, model sync, AI retry)`)
} finally {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Windows 上 SQLite 句柄要等进程退出才放开，临时目录留着无妨。
  }
}
