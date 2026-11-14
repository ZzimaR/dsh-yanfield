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
        yield { type: "text-delta", text: typeof scripted === "function" ? await scripted(messages) : scripted }
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
  const replaceSelection = (id, text) => JSON.stringify({ replacements: [{ id, text }] })
  async function agentRun(message, replies, context = {}, inspectEvents) {
    scriptedReplies.push(...replies)
    const result = await call("POST", "/yanfield/api/ai/agent", JSON.stringify({ novelId, message, ...context }))
    assert.equal(result.status, 200)
    assert.equal(scriptedReplies.length, 0)
    const events = result.body.split(/\r?\n/).filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)))
    inspectEvents?.(events)
    return events.findLast((event) => event.type === "agent").run
  }
  const apply = (run, changes) => api("POST", `/ai/agent/${run.id}/apply`, { novelId, selections: changes.map(({ id }) => ({ id })) })
  const { data: firstCard } = await api("POST", "/world", { novelId, category: "rule", title: "First rule" })
  const { data: lastCard } = await api("POST", "/world", { novelId, category: "rule", title: "Last rule" })
  const { data: childCard } = await api("POST", "/world", { novelId, category: "rule", title: "Child rule", parentId: firstCard.id })
  const orderEndpoint = `/codex-order?novelId=${novelId}`
  assert.deepEqual((await api("GET", orderEndpoint)).data, {})
  const reorder = (id, anchor) => api("POST", "/codex-order", { novelId, group: "world", id, anchor, after: false })
  assert.equal((await reorder(lastCard.id, firstCard.id)).status, 200)
  const savedOrder = (await api("GET", orderEndpoint)).data.world
  assert(savedOrder.indexOf(lastCard.id) < savedOrder.indexOf(firstCard.id))
  assert.equal((await reorder(childCard.id, lastCard.id)).status, 400)
  assert.deepEqual((await api("GET", orderEndpoint)).data.world, savedOrder)
  assert.equal((await api("GET", `/world/${childCard.id}`)).data.parentId, firstCard.id)
  const discussion = await agentRun("你觉得怎么改合适？", [
    decision("read", { kind: "world", id: firstCard.id }),
    decision("propose", { kind: "world", id: firstCard.id, fields: { summary: "Unauthorized" } }),
    JSON.stringify({ message: "确实有些重叠，可以让第三程造式、第五程借势。", calls: [], done: true }),
  ], {}, events => {
    const answer = events.findIndex(event => event.type === "agent" && event.run.answering)
    assert(answer >= 0)
    assert.equal(events[answer].run.status, "running")
    assert.match(events[answer].run.summary, /第三程造式/)
    assert.equal(events.findLast(event => event.type === "agent").run.answering, undefined)
  })
  assert.equal(discussion.steps[0].status, "complete")
  assert.equal(discussion.steps[1].status, "error")
  assert.equal(discussion.changes.length, 0)
  assert.match(discussion.summary, /第三程造式/)
  assert(!discussion.progress.some(progress => progress.text === discussion.summary))
  const cardWithoutReply = await agentRun("Prepare a change to the first rule", [
    decision("read", { kind: "world", id: firstCard.id }),
    decision("propose", { kind: "world", id: firstCard.id, fields: { summary: "A useful rule." } }),
    JSON.stringify({ message: "", calls: [], done: true }),
  ])
  assert.equal(cardWithoutReply.recap, true)
  assert.deepEqual(cardWithoutReply.changes[0].after, { summary: "A useful rule." })
  const asksForAdvice = await agentRun("你觉得这个规则有什么问题？怎么改比较自然？", [
    decision("reject_change", { changeId: cardWithoutReply.changes[0].id }),
    decision("propose", { kind: "world", id: cardWithoutReply.changes[0].id, fields: { summary: "Do not stage this." } }),
    JSON.stringify({ message: "可以先说清这个规则的限制，再举一个例子。", calls: [], done: true }),
  ], { previousRunId: cardWithoutReply.id })
  assert.deepEqual(asksForAdvice.changes, [])
  assert(asksForAdvice.steps.every(step => step.status === "error"))
  assert.equal((await api("GET", `/ai/agent/${cardWithoutReply.id}?novelId=${novelId}`)).data.changes[0].state, "pending")
  const asksForEdit = await agentRun("你觉得怎么改合适？请帮我改这张设定卡。", [
    decision("read", { kind: "world", id: firstCard.id }),
    decision("propose", { kind: "world", id: firstCard.id, fields: { summary: "The rule takes effect at dawn." } }),
    reply,
  ])
  assert.equal(asksForEdit.changes[0].state, "pending")
  const chapter = (await api("POST", "/chapters", { novelId, title: "Test chapter", content: "<p>Before</p><p>Chosen</p><p>After</p>" })).data
  const selectionRun = await agentRun("Only replace the selected text", [
    decision("read", { kind: "chapter", id: chapter.id }),
    decision("write_chapter", { id: chapter.id, mode: "rewrite", title: "Unrequested title", instruction: "Rewrite" }),
    replaceSelection(1, "Revised $&"), reply,
  ], { chapterId: chapter.id, selection: "Chosen", context: { includeSelection: true } })
  assert.equal(selectionRun.summary, "Done")
  assert.deepEqual(selectionRun.changes[0].after, { content: "<p>Before</p><p>Revised $&amp;</p><p>After</p>" })
  assert.equal((await apply(selectionRun, selectionRun.changes)).status, 200)
  const repeatedHtml = "<p>Same line.</p><p>Same <strong>line.</strong></p><p>Next line.</p><p>Untouched.</p>"
  const { data: repeated } = await api("POST", "/chapters", { novelId, title: "Selection range", content: repeatedHtml })
  const { data: quoteSession } = await api("POST", "/chat/sessions", { novelId, chapterId: repeated.id, agentId: "supervisor" })
  const quote = "Same line.\nNext line."
  const range = { chapterTitle: repeated.title, from: 11, to: 11 + quote.length, startLine: 2, endLine: 3 }
  const ranged = await agentRun("Polish the selected lines", [
    decision("read", { kind: "chapter", id: repeated.id }),
    decision("write_chapter", { id: repeated.id, instruction: "Polish the selection" }),
    replaceSelection(2, "　Updated line.  "), reply,
  ], { chapterId: repeated.id, sessionId: quoteSession.id, selection: quote, selectionReference: range, context: { includeSelection: true } })
  assert.equal(ranged.changes[0].after.content, repeatedHtml.replace("Next line.", "Updated line."))
  const retriedParagraphs = await agentRun("Polish the selected lines again", [
    decision("read", { kind: "chapter", id: repeated.id }),
    decision("write_chapter", { id: repeated.id, instruction: "Polish the selection" }),
    replaceSelection(1, "Same line.\n\nUpdated line."),
    (messages) => {
      assert.match(messages.at(-1).content[0].text, /只使用 selection 中的编号/)
      return replaceSelection(2, "Updated line.")
    }, reply,
  ], { chapterId: repeated.id, selection: quote, selectionReference: range, context: { includeSelection: true } })
  assert.equal(retriedParagraphs.changes[0].after.content, repeatedHtml.replace("Next line.", "Updated line."))
  const invalidTarget = await agentRun("Polish the selected lines", [
    decision("read", { kind: "chapter", id: repeated.id }),
    decision("write_chapter", { id: repeated.id, instruction: "Polish the selection" }),
    replaceSelection(3, "Outside selection"), JSON.stringify({ replacements: [
      { id: 1, text: "One." }, { id: 1, text: "Two." },
    ] }), reply,
  ], { chapterId: repeated.id, selection: quote, selectionReference: range, context: { includeSelection: true } })
  assert.deepEqual(invalidTarget.changes, [])
  assert.equal((await api("GET", `/chapters/${repeated.id}`)).data.content, repeatedHtml)
  const quoteHistory = (await api("GET", `/chat/sessions/${quoteSession.id}/messages?novelId=${novelId}`)).data.items
  assert.deepEqual(quoteHistory.find(message => message.role === "user").actions[0].payload, { text: quote, reference: range })
  const duplicated = await agentRun("Change the second occurrence", [
    decision("read", { kind: "chapter", id: repeated.id }),
    decision("write_chapter", { id: repeated.id, instruction: "Change the selected phrase" }),
    replaceSelection(1, "New line."), reply,
  ], { chapterId: repeated.id, selection: "Same line.", selectionReference: { ...range, to: 21, endLine: 2 }, context: { includeSelection: true } })
  assert.equal(duplicated.changes[0].after.content, repeatedHtml.replace("Same <strong>", "New <strong>"))
  const shortSelection = await agentRun("这里顺一点", [
    (messages) => {
      assert.match(messages.at(-1).content[0].text, /润色已选中的正文/)
      return decision("write_chapter", { id: chapter.id, mode: "rewrite", instruction: "Smooth it" })
    },
    (messages) => {
      const current = JSON.parse(messages.at(-2).content[0].text).current
      assert.match(current.after, /Next line/)
      return replaceSelection(1, "Better line.")
    }, reply,
  ], { chapterId: repeated.id, selection: "Same line.", selectionReference: { ...range, to: 21, endLine: 2 }, context: { includeSelection: true } })
  assert.equal(shortSelection.changes[0].targetId, repeated.id)
  assert.match(shortSelection.changes[0].after.content, /^<p>Same line\.<\/p>/)
  const appendShort = await agentRun("接着写", [
    decision("write_chapter", { id: chapter.id, title: "Wrong title", mode: "rewrite", instruction: "Continue" }),
    "Then she went home.", reply,
  ], { chapterId: repeated.id })
  assert.deepEqual(appendShort.changes[0].after, { content: repeatedHtml + "<p>Then she went home.</p>" })
  assert.equal(appendShort.changes[0].targetId, repeated.id)
  const questionAboutDraft = await agentRun("这里不是镇吗？", [
    decision("write_chapter", { id: appendShort.changes[0].id, mode: "patch", instruction: "Edit the draft" }),
    JSON.stringify({ message: "如果设定是镇，这两处称呼要统一。", calls: [], done: true }),
  ], { chapterId: repeated.id, previousRunId: appendShort.id })
  assert.deepEqual(questionAboutDraft.changes, [])
  assert.equal((await api("GET", `/ai/agent/${appendShort.id}?novelId=${novelId}`)).data.changes[0].state, "pending")
  const correction = await agentRun("把上轮正文候选里的地名改成镇。", [
    decision("write_chapter", { id: chapter.id, mode: "rewrite", instruction: "Correct it" }),
    decision("write_chapter", { id: appendShort.changes[0].id, mode: "patch", instruction: "Correct it", edits: [
      { original: "Untouched.", replacement: "The town was quiet." },
    ] }), reply,
  ], { chapterId: repeated.id, previousRunId: appendShort.id })
  assert.deepEqual(correction.changes[0].after, { content: repeatedHtml.replace("Untouched.", "The town was quiet.") + "<p>Then she went home.</p>" })
  assert.equal(correction.steps[0].status, "error")

  const localChapter = (await api("POST", "/chapters", {
    novelId, title: "Local edit", content: "<p>She lives in the village.</p><p><strong>Leave this alone.</strong></p>",
  })).data
  const localRun = await agentRun("Change this sentence to say she lives in town.", [
    decision("read", { kind: "chapter", id: localChapter.id }),
    decision("write_chapter", { id: localChapter.id, mode: "rewrite", instruction: "Rewrite the chapter" }),
    decision("write_chapter", {
      id: localChapter.id, mode: "patch", instruction: "Correct the place", title: "Ignore this title",
      edits: [{ original: "in the village", replacement: "in town" }],
    }),
    reply,
  ], { chapterId: localChapter.id })
  assert(localRun.steps.some(step => step.tool === "write_chapter" && step.status === "error"))
  assert.deepEqual(localRun.changes.map(change => change.after), [
    { content: "<p>She lives in town.</p><p><strong>Leave this alone.</strong></p>" },
  ])
  const patchTool = (original, replacement) => decision("write_chapter", {
    id: localChapter.id, mode: "patch", instruction: "Correct one passage", edits: [{ original, replacement }],
  })
  const recoveredPatch = await agentRun("Correct the place", [
    decision("read", {kind:"chapter", id:localChapter.id}),
    patchTool("Unmatched", "town"),
    patchTool("in the village", "in town"),
    patchTool("Unmatched", "town"),
    reply,
  ], {chapterId:localChapter.id})
  assert.equal(recoveredPatch.stoppedOnValidation, undefined)
  assert.deepEqual(recoveredPatch.steps.filter(step => step.tool === "write_chapter").map(step => step.status), ["error","complete","error"])
  const stoppedPatch = await agentRun("Correct the place", [
    decision("read", {kind:"chapter", id:localChapter.id}),
    patchTool("in the village", "in town"),
    patchTool("Unmatched", "town"),
    patchTool("Unmatched", "town"),
  ], {chapterId:localChapter.id})
  assert.equal(stoppedPatch.stoppedOnValidation, true)
  assert.equal(stoppedPatch.changes[0].state, "pending")
  const { data: session } = await api("POST", "/chat/sessions", { novelId, chapterId: chapter.id, agentId: "supervisor" })
  const sessionPrompt = "Polish the selected text"
  const historyRoute = `/chat/sessions/${session.id}/messages?novelId=${novelId}`
  const selectionReplies = [
    decision("read", { kind: "chapter", id: chapter.id }),
    decision("write_chapter", { id: chapter.id, instruction: "Polish" }),
  ]
  const firstAttempt = await agentRun(sessionPrompt, [...selectionReplies, replaceSelection(1, "Improved"), reply], {
    sessionId: session.id, chapterId: chapter.id, selection: "Revised $&", context: { includeSelection: true },
  })
  const history = (await api("GET", historyRoute)).data.items
  const savedAction = history.find(message => message.role === "assistant").actions[0]
  assert.equal(savedAction.payload.requestContext.selection, "Revised $&")
  assert.equal(savedAction.payload.requestContext.chapterId, chapter.id)
  const attemptedAgain = await agentRun(sessionPrompt, [...selectionReplies, replaceSelection(1, "Polished"), reply], {
    sessionId: session.id, chapterId: localChapter.id, retryRunId: firstAttempt.id,
    context: { includeSelection: false },
  })
  assert.equal(attemptedAgain.chapterId, chapter.id)
  assert.equal(attemptedAgain.messageId, firstAttempt.messageId)
  assert.equal(attemptedAgain.changes[0].targetId, chapter.id)
  assert.deepEqual(attemptedAgain.changes[0].after, { content: "<p>Before</p><p>Polished</p><p>After</p>" })
  assert.equal((await api("GET", historyRoute)).data.items.length, 2)
  const { data: separateSession } = await api("POST", "/chat/sessions", { novelId, agentId: "supervisor" })
  const foreignRun = await call("POST", "/yanfield/api/ai/agent", JSON.stringify({
    novelId, sessionId: separateSession.id, chapterId: chapter.id, previousRunId: firstAttempt.id,
    message: "Continue a candidate from another conversation",
  }))
  assert(foreignRun.body.includes("任务不属于该会话"))
  assert.deepEqual((await api("GET", `/chat/sessions/${separateSession.id}/messages?novelId=${novelId}`)).data.items, [])
  const { data: qaVolume } = await api("POST", "/volumes", { novelId, title: "First volume" })
  const { data: archiveChapter } = await api("POST", "/chapters", { novelId, volumeId: qaVolume.id, title: "Archived chapter", content: "<p>The lamp went out.</p>" })
  const { data: laterChapter } = await api("POST", "/chapters", { novelId, volumeId: qaVolume.id, title: "Later chapter", content: "<p>Before dawn.</p>" })
  const treeResult = await api("GET", `/novels/${novelId}/tree`)
  assert(treeResult.data.volumes.find(volume => volume.id === qaVolume.id).chapters.some(item => item.id === archiveChapter.id))
  const { data: archive } = await api("POST", "/archives", {
    novelId, chapterId: archiveChapter.id, chapterSummary: "The lamp went out.", generatedBy: "manual",
  })
  assert.equal((await api("GET", `/archives?novelId=${novelId}&chapterId=${archiveChapter.id}`)).data.item.id, archive.id)
  const archiveRead = await agentRun("Review the earlier archive", [
    decision("read_archive", { chapterId: archiveChapter.id }), reply,
  ], { chapterId: laterChapter.id, context: { includeArchives: true } })
  assert.equal(archiveRead.steps[0].status, "complete")
  const futureRead = await agentRun("Review archives", [
    decision("read_archive", { chapterId: archiveChapter.id }), reply,
  ], { chapterId: archiveChapter.id, context: { includeArchives: true } })
  assert.equal(futureRead.steps[0].status, "error")
  await api("PATCH", `/chapters/${localChapter.id}`, { content: "<p>Author edit after review opened.</p>" })
  assert.equal((await apply(localRun, localRun.changes)).status, 409)
  assert.equal((await api("GET", `/chapters/${localChapter.id}`)).data.content, "<p>Author edit after review opened.</p>")
  await api("PATCH", `/chapters/${localChapter.id}`, { content: localChapter.content })

  const manuscript = `<p>${'She said "wait". '.repeat(290)}The bridge closed.</p>`
  const longChapter = (await api("POST", "/chapters", { novelId, title: "Long chapter", content: manuscript })).data
  const readChapter = (offset) => decision("read", { kind: "chapter", id: longChapter.id, offset })
  function chapterReceipt(messages) {
    const text = messages.at(-1).content[0].text
    const receipt = text.split("返回：")[1].split("\n当前候选：")[0]
    assert(receipt.length <= 4000)
    return JSON.parse(receipt)
  }
  let firstPage
  const blueprintRun = await agentRun("根据正文改章纲", [
    readChapter(0),
    (messages) => {
      firstPage = chapterReceipt(messages)
      assert(firstPage.nextOffset > 0)
      assert.equal(firstPage.contentTotal, manuscript.length)
      return decision("propose", { kind: "blueprint", id: longChapter.id, fields: { goal: "Premature" } })
    },
    (messages) => {
      assert.match(messages.at(-1).content[0].text, /读完当前章正文/)
      return readChapter(firstPage.nextOffset)
    },
    (messages) => {
      const secondPage = chapterReceipt(messages)
      assert.equal(secondPage.contentOffset, firstPage.nextOffset)
      assert.equal(secondPage.nextOffset, null)
      assert.equal(firstPage.content + secondPage.content, manuscript)
      return decision("propose", { kind: "blueprint", id: longChapter.id, fields: { goal: "The bridge closes." } })
    },
    reply,
  ], { chapterId: longChapter.id, context: { includeChapterBlueprint: true } })
  assert.equal(blueprintRun.changes.length, 1)
  assert.equal(blueprintRun.changes[0].kind, "blueprint")
  assert.equal(blueprintRun.changes[0].targetId, longChapter.id)
  assert.deepEqual(blueprintRun.changes[0].after, { goal: "The bridge closes." })
  assert.equal((await apply(blueprintRun, blueprintRun.changes)).status, 200)
  assert.equal((await api("GET", `/chapters/${longChapter.id}/blueprint`)).data.goal, "The bridge closes.")
  assert.equal((await api("GET", `/chapters/${longChapter.id}`)).data.content, manuscript)
  const revisedBlueprint = await agentRun("Refine the existing chapter blueprint", [
    readChapter(0),
    decision("propose", { kind: "blueprint", id: longChapter.id, fields: { goal: "Leave before the bridge closes." } }),
    reply,
  ], { chapterId: longChapter.id, context: { includeChapterBlueprint: true } })
  assert.equal(revisedBlueprint.changes[0].before.goal, "The bridge closes.")
  assert.equal((await api("GET", `/chapters/${longChapter.id}/blueprint`)).data.goal, "The bridge closes.")
  assert.equal((await apply(revisedBlueprint, revisedBlueprint.changes)).status, 200)
  assert.equal((await api("GET", `/chapters/${longChapter.id}/blueprint`)).data.goal, "Leave before the bridge closes.")
  const outlineDraft = await agentRun("Set a new goal", [
    decision("read", { kind: "blueprint", id: longChapter.id }),
    decision("propose", { kind: "blueprint", id: longChapter.id, fields: { goal: "Wait by the bridge." } }),
    reply,
  ], { chapterId: longChapter.id })
  const invalidFollowUp = await agentRun("Revise the candidate", [
    decision("propose", { kind: "blueprint", id: outlineDraft.changes[0].id, fields: { unknownField: "invalid" } }),
    reply,
  ], { chapterId: longChapter.id, previousRunId: outlineDraft.id })
  assert.deepEqual(invalidFollowUp.changes, [])
  assert.equal((await api("GET", `/ai/agent/${outlineDraft.id}?novelId=${novelId}`)).data.changes[0].state, "pending")
  const retiredWhileGenerating = await agentRun("Continue revising the goal", [
    async () => {
      const rejected = await api("PATCH", `/ai/agent/${outlineDraft.id}`, {
        novelId, op: "reject", changeId: outlineDraft.changes[0].id,
      })
      assert.equal(rejected.status, 200)
      return decision("propose", { kind: "blueprint", id: outlineDraft.changes[0].id, fields: { goal: "Wait until dawn." } })
    }, reply,
  ], { chapterId: longChapter.id, previousRunId: outlineDraft.id })
  assert.deepEqual(retiredWhileGenerating.changes, [])
  assert.match(retiredWhileGenerating.steps[0].detail, /原候选已有更新/)
  assert.equal((await api("GET", `/ai/agent/${outlineDraft.id}?novelId=${novelId}`)).data.changes[0].state, "rejected")

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
  const existingSource = await agentRun("Revise a chapter with an already saved source", [
    decision("read", { kind: "chapter", id: localChapter.id }),
    decision("write_chapter", { id: localChapter.id, instruction: "Expand the chapter" }),
    "She lives in the village.\n" + "Another passage. ".repeat(20),
    reply,
    (messages) => {
      const [{ id: sourceId }] = JSON.parse(messages.at(-1).content[0].text).sources
      return JSON.stringify({ cards: [{
        kind: "location", fields: { name: "The village", summary: "Where she lives" },
        evidence: [{ field: "summary", sourceId, quote: "She lives in the village." }],
      }] })
    },
  ], { chapterId: localChapter.id, context: { includeWorld: true } })
  const [pendingProse, independentNote] = existingSource.changes
  assert.equal(pendingProse.state, "pending")
  assert.equal((await apply(existingSource, [independentNote])).status, 200)
  assert.equal((await api("GET", `/chapters/${localChapter.id}`)).data.content, localChapter.content)
  const oldDraft = await draft("Accepted chapter")
  const accepted = await agentRun("Change this sentence in the draft", [
    decision("write_chapter", { id: oldDraft.changes[0].id, mode: "patch", instruction: "Refine it",
      edits: [{ original: "A child asked a question.", replacement: "A child raised a hand." }] }),
    reply,
  ], { previousRunId: oldDraft.id })
  assert.equal(accepted.changes[1].evidence[0].sourceId, accepted.changes[0].id)
  assert.equal((await apply(accepted, [...accepted.changes].reverse())).status, 200)
  assert.equal((await apply(accepted, [...accepted.changes].reverse())).status, 200)
  assert.equal((await api("GET", `/characters/${character.id}`)).data.appearance, "Black coat")
  assert.equal((await api("POST", `/ai/agent/${accepted.id}/apply`, { novelId, op: "undo" })).status, 200)
  assert.equal((await api("GET", `/characters/${character.id}`)).data.appearance, "")
  const { data: disposable } = await api("POST", "/characters", { novelId, name: "Extra" })
  const deletion = await agentRun("Delete the Extra character card", [
    decision("read", { kind: "character", id: disposable.id }),
    decision("delete", { kind: "character", id: disposable.id, reason: "Requested deletion" }),
    reply,
  ])
  assert.equal((await api("GET", `/characters/${disposable.id}`)).status, 200)
  assert.equal((await apply(deletion, deletion.changes)).status, 200)
  assert.equal((await api("GET", `/characters/${disposable.id}`)).status, 404)
  assert.equal((await api("POST", `/ai/agent/${deletion.id}/apply`, { novelId, op: "undo" })).status, 200)
  assert.equal((await api("GET", `/characters/${disposable.id}`)).data.name, "Extra")

  const richText = '<ul><li><p>One</p><ul><li><p>Nested</p></li></ul></li></ul><blockquote><p>Quote</p></blockquote><hr>'
  const original = richText + "<p>She  paused.</p><p>End.</p>"
  const revised = richText + "<p>She paused.</p><p>New ending.</p>"
  const diff = diffBlocks(original, revised)
  assert.equal(diff.items.length, 2)
  assert.equal(applyBlockDiff(original, diff, [diff.items[0].id]), richText + "<p>She paused.</p><p>End.</p>")

  console.log(`[dsh-yanfield] smoke ok (${payload.items.length} novels, volumes, archives, settings restart, model sync, session retry, local edits, blueprint pagination, candidate revisions, stale review, source evidence, partial apply and undo)`)
} finally {
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Windows 上 SQLite 句柄要等进程退出才放开，临时目录留着无妨。
  }
}
