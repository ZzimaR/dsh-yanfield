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
const scriptedReplies = []
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
    async *stream({ maxTokens, messages }) {
      const scripted = scriptedReplies.shift()
      if (scripted !== undefined) {
        yield { type: "text-delta", text: typeof scripted === "function" ? scripted(messages) : scripted }
        yield { type: "finish", reason: { kind: "stop" } }
        return
      }
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

  const novelId = novel.id
  const decision = (name, args) => JSON.stringify({ message: "", calls: [{ name, args }], done: false })
  const reply = JSON.stringify({ message: "Done", calls: [{ name: "respond", args: { message: "Done" } }], done: true })
  async function agentRun(message, replies, context = {}) {
    scriptedReplies.push(...replies)
    const result = await call("POST", "/yanfield/api/ai/agent", JSON.stringify({ novelId, message, ...context }))
    assert.equal(result.status, 200)
    assert.equal(scriptedReplies.length, 0)
    return result.body.split(/\r?\n/).filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6))).findLast((event) => event.type === "agent").run
  }
  const apply = (run, changes) => api("POST", `/ai/agent/${run.id}/apply`, { novelId, selections: changes.map(({ id }) => ({ id })) })
  const chapter = (await api("POST", "/chapters", { novelId, title: "Test chapter", content: "<p>Before</p><p>Chosen</p><p>After</p>" })).data
  const selectionRun = await agentRun("Only replace the selected text", [
    decision("read", { kind: "chapter", id: chapter.id }),
    decision("write_chapter", { id: chapter.id, mode: "rewrite", title: "Unrequested title", instruction: "Rewrite" }),
    "Revised $&", reply,
  ], { chapterId: chapter.id, selection: "Chosen", context: { includeSelection: true } })
  assert.equal(selectionRun.summary, "Done")
  assert.deepEqual(selectionRun.changes[0].after, { content: "<p>Before</p><p>Revised $&amp;</p><p>After</p>" })
  assert.equal((await apply(selectionRun, selectionRun.changes)).status, 200)

  const character = (await api("POST", "/characters", { novelId, name: "Gu", identity: "teacher" })).data
  const snapshotRun = await agentRun("Only edit the speaking style", [
    decision("read", { kind: "character", id: character.id }),
    decision("propose", { kind: "character", id: character.id, fields: { speechStyle: "Plain" } }), reply,
  ], { snapshot: { kind: "character", id: character.id, fields: { identity: "unsaved draft" } } })
  assert.deepEqual(snapshotRun.changes[0].after, { speechStyle: "Plain" })
  assert.equal((await apply(snapshotRun, snapshotRun.changes)).status, 200)
  assert.equal((await api("GET", `/characters/${character.id}`)).data.identity, "teacher")

  async function draft(title) {
    const quote = "Gu wears a black coat."
    return agentRun("Draft a chapter", [
      decision("write_chapter", { title, instruction: "Continue" }),
      `${quote}\nA child asked a question.`, reply,
      (messages) => {
        const [{ id: sourceId }] = JSON.parse(messages.at(-1).content[0].text).sources
        return JSON.stringify({ cards: [{
          kind: "character", fields: { name: "Gu", appearance: "Black coat", personality: "Patient", age: "Forty" },
          evidence: [
            { field: "appearance", sourceId, quote },
            { field: "personality", sourceId, quote },
            { field: "age", sourceId, quote: "A child asked a question." },
          ],
        }] })
      },
    ], { context: { includeCharacters: true } })
  }
  const discarded = await draft("Discarded chapter")
  const [discardedChapter, discardedNote] = discarded.changes
  assert.deepEqual(discardedNote.after, { appearance: "Black coat" })
  assert.equal((await apply(discarded, [discardedNote])).status, 409)
  assert.equal((await api("PATCH", `/ai/agent/${discarded.id}`, { novelId, op: "reject", changeId: discardedChapter.id })).status, 200)
  assert.equal((await apply(discarded, [discardedNote])).status, 409)
  const partial = await draft("Partially accepted chapter")
  const [partialChapter, partialNote] = partial.changes
  const { build } = await import("esbuild")
  const diffBundle = await build({ entryPoints: [path.join(root, "src/yanfield/lib/diff/blocks.ts")], bundle: true, platform: "node", format: "esm", write: false })
  const { diffBlocks, applyBlockDiff } = await import(`data:text/javascript;base64,${Buffer.from(diffBundle.outputFiles[0].text).toString("base64")}`)
  const onlyQuestion = diffBlocks("", partialChapter.after.content).items.find((item) => item.afterText === "A child asked a question.").id
  const partialApply = await api("POST", `/ai/agent/${partial.id}/apply`, {
    novelId, selections: [{ id: partialChapter.id, blocks: [onlyQuestion] }, { id: partialNote.id }],
  })
  assert.equal(partialApply.status, 409)
  assert.equal((await api("GET", `/ai/agent/${partial.id}?novelId=${novelId}`)).data.changes[0].state, "pending")
  const accepted = await draft("Accepted chapter")
  assert.equal((await apply(accepted, [...accepted.changes].reverse())).status, 200)
  assert.equal((await api("GET", `/characters/${character.id}`)).data.appearance, "Black coat")

  const richText = '<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li></ul><blockquote><p>Quote</p></blockquote><hr>'
  const original = richText + "<p>She  paused.</p><p>End.</p>"
  const revised = richText + "<p>She paused.</p><p>New ending.</p>"
  const diff = diffBlocks(original, revised)
  assert.equal(diff.items.length, 2)
  assert.equal(applyBlockDiff(original, diff, [diff.items[0].id]), richText + "<p>She paused.</p><p>End.</p>")

  console.log(`[dsh-yanfield] smoke ok (${payload.items.length} novels, settings restart, model sync, AI retry, selection, field scope, source evidence, rich-text review)`)
} finally {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Windows 上 SQLite 句柄要等进程退出才放开，临时目录留着无妨。
  }
}
