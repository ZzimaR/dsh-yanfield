import assert from "node:assert/strict"
import { stat } from "node:fs/promises"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { gzipSync, gunzipSync } from "node:zlib"

const backupHeader = Buffer.from("YANFIELD-1\n")

export async function checkBackups({ call, api, dbPath, novelId, chapter, qaVolume, archive, session, attemptedAgain, scriptedReplies, restart, chapterOperations }) {
  const novelRoute = `/novels/${novelId}`
  const original = (await api("GET", novelRoute)).data
  const other = (await api("POST", "/novels", { title: "Unrelated manuscript" })).data
  const characters = []
  for (const name of ["Backup character A", "Backup character B"]) {
    const created = await api("POST", "/characters", { novelId, name })
    assert.equal(created.status, 201)
    characters.push(created.data)
  }
  const [a, b] = characters
  assert.equal((await api("PATCH", `/characters/${a.id}`, { relations: [{ targetId: b.id, relation: "ally", note: "" }] })).status, 200)
  assert.equal((await api("POST", "/codex-order", {
    novelId, group: "characters", id: a.id, anchor: b.id, after: true,
  })).status, 200)
  const db = new DatabaseSync(dbPath)
  try {
    db.prepare("INSERT INTO word_snapshots(date,words,ai_tokens) VALUES ('2000-01-01',12,3)").run()
    const providerKey = "fixture-backup-private-key"
    const provider = (await api("POST", "/providers", {
      name: "Backup test provider", kind: "deepseek", baseUrl: "https://example.invalid/v1", apiKey: providerKey,
      models: [{ id: "fixture-model", label: "Fixture model" }],
    })).data
    for (const [name, id] of [["Library preset", null], ["Book preset", novelId]]) {
      assert.equal((await api("POST", "/presets", { name, novelId: id, feature: "custom", systemPrompt: "Keep the voice." })).status, 201)
    }
    const preferences = {
      global: { "yanfield:theme": "dark", "foreign-key": "must not travel" },
      books: { [novelId]: { chapter: JSON.stringify(chapter.id), collapsed: JSON.stringify({ [qaVolume.id]: true }) } },
    }
    const exportFile = async (data) => {
      const result = await call("POST", "/yanfield/api/backup/export", JSON.stringify(data))
      assert.equal(result.status, 200, result.body)
      assert.match(result.headers["content-disposition"], /filename="yanfield-.*\.yanfield"/)
      assert.equal(result.headers["cache-control"], "no-store")
      return result.buffer
    }
    const importFile = async (file, { mode = "preview", ids = [], fingerprint, password, authorized = true } = {}) => {
      const form = new FormData()
      form.set("file", new Blob([file]), "fixture.yanfield")
      form.set("mode", mode)
      if (fingerprint) form.set("fingerprint", fingerprint)
      if (password) form.set("password", password)
      for (const id of ids) form.append("novelId", id)
      const request = new Request("http://localhost", { method: "POST", body: form })
      const result = await call("POST", "/yanfield/api/backup/import", Buffer.from(await request.arrayBuffer()), {
        "content-type": request.headers.get("content-type"),
        ...(authorized ? { "x-yanfield-backup": "1" } : {}),
      })
      return { status: result.status, data: JSON.parse(result.body) }
    }
    const decode = file => JSON.parse(gunzipSync(file.subarray(backupHeader.length)).toString("utf8"))
    const encode = manifest => Buffer.concat([backupHeader, gzipSync(JSON.stringify(manifest))])
    const plain = await exportFile({ scope: "all", preferences })
    const manifest = decode(plain)
    const tableNames = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    assert.deepEqual(Object.keys(manifest.rows).sort(), tableNames.map(row => row.name), "Every persistent table must be exported")
    assert.equal(manifest.rows.providers.find(row => row.id === provider.id).api_key, "")
    assert.equal(manifest.rows.word_snapshots.find(row => row.date === "2000-01-01").words, 12)
    assert.equal(manifest.preferences.global["foreign-key"], undefined)

    const password = "fixture-backup-password"
    const encrypted = await exportFile({ scope: "all", password, preferences })
    assert.equal(encrypted.includes(providerKey), false)
    assert.equal((await importFile(encrypted)).status, 400)
    assert.equal((await importFile(encrypted, { password: "wrong password" })).status, 400)
    assert.equal((await importFile(encrypted, { password, authorized: false })).status, 415)
    const full = await importFile(encrypted, { password })
    assert.equal(full.status, 200, JSON.stringify(full.data))
    assert.equal(full.data.includesKeys, true)

    const selectedFile = await exportFile({ scope: "books", novelIds: [novelId, other.id], preferences })
    const selectedManifest = decode(selectedFile)
    for (const table of ["providers", "app_settings", "word_snapshots"]) assert.deepEqual(selectedManifest.rows[table], [])
    const selectedPreview = await importFile(selectedFile)
    assert.equal(selectedPreview.status, 200, JSON.stringify(selectedPreview.data))
    assert.equal(selectedPreview.data.books.length, 2)
    const book = selectedPreview.data.books.find(book => book.id === novelId)
    assert(book.existing && book.chapters > 0 && book.notes > 0 && book.conversations > 0)
    const options = { fingerprint: selectedPreview.data.fingerprint, ids: [novelId] }
    assert.equal((await importFile(selectedFile, { ...options, mode: "restore" })).status, 400)
    assert.equal((await importFile(plain, { ...options, mode: "copy" })).status, 409)
    const copied = await importFile(selectedFile, { ...options, mode: "copy" })
    assert.equal(copied.status, 200, JSON.stringify(copied.data))
    assert.equal(copied.data.books, 1)
    assert.equal(copied.data.preferences.global, undefined)
    const copyId = Object.keys(copied.data.preferences.books)[0]
    assert.notEqual(copyId, novelId)
    const copyTree = (await api("GET", `/novels/${copyId}/tree`)).data
    const copyChapter = [...copyTree.looseChapters, ...copyTree.volumes.flatMap(volume => volume.chapters)].find(item => item.title === chapter.title)
    assert.notEqual(copyChapter.id, chapter.id)
    assert.equal(copyChapter.content, (await api("GET", `/chapters/${chapter.id}`)).data.content)
    assert.equal(JSON.parse(copied.data.preferences.books[copyId].chapter), copyChapter.id)
    const copyVolume = copyTree.volumes.find(volume => volume.title === qaVolume.title)
    assert.deepEqual(JSON.parse(copied.data.preferences.books[copyId].collapsed), { [copyVolume.id]: true })
    const copyArchive = (await api("GET", `/archives?novelId=${copyId}&chapterId=${copyVolume.chapters[0].id}`)).data.item
    assert.equal(copyArchive.chapterSummary, archive.chapterSummary)
    const cardRows = (await api("GET", `/characters?novelId=${copyId}`)).data.items
    const [copyA, copyB] = ["Backup character A", "Backup character B"].map(name => cardRows.find(row => row.name === name))
    assert.equal(copyA.relations[0].targetId, copyB.id)
    const order = (await api("GET", `/codex-order?novelId=${copyId}`)).data.characters
    assert(order.indexOf(copyB.id) < order.indexOf(copyA.id))
    assert((await api("GET", `/presets?novelId=${copyId}`)).data.items.some(item => item.novelId === copyId && item.name === "Book preset"))

    const copySessions = (await api("GET", `/chat/sessions?novelId=${copyId}`)).data.items
    const currentSession = (await api("GET", `/chat/sessions?novelId=${novelId}`)).data.items.find(item => item.id === session.id)
    const copySession = copySessions.find(item => item.chapterId === copyChapter.id && item.title === currentSession.title)
    assert.notEqual(copySession.id, session.id)
    const messagesRoute = `/chat/sessions/${copySession.id}/messages?novelId=${copyId}`
    const copyMessages = (await api("GET", messagesRoute)).data.items
    const copyRunId = copyMessages.find(item => item.role === "assistant").actions[0].payload.runId
    assert.notEqual(copyRunId, attemptedAgain.id)
    const copyRun = (await api("GET", `/ai/agent/${copyRunId}?novelId=${copyId}`)).data
    assert.equal(copyRun.sessionId, copySession.id)
    assert.equal(copyRun.changes[0].targetId, copyChapter.id)
    assert.notEqual(copyRun.changes[0].id, attemptedAgain.changes[0].id)
    assert.equal(copyRun.changes[0].state, "pending")
    assert.equal(copyRun.requestContext.selection, attemptedAgain.requestContext.selection)
    const applied = await api("POST", `/ai/agent/${copyRunId}/apply`, { novelId: copyId, selections: [{ id: copyRun.changes[0].id }] })
    assert.equal(applied.status, 200, JSON.stringify(applied.data))
    assert.match((await api("GET", `/chapters/${copyChapter.id}`)).data.content, /Polished/)
    assert.doesNotMatch((await api("GET", `/chapters/${chapter.id}`)).data.content, /Polished/)
    const copiedRuns = db.prepare("SELECT data FROM agent_runs WHERE novel_id = ?").all(copyId).map(row => JSON.parse(row.data))
    const copiedSplit = copiedRuns.find(run => run.request === chapterOperations.backupSplit.request && run.changes[0]?.state === "pending")
    const split = copiedSplit.changes[0]
    assert.notEqual(split.chapterSplit.existing.id, chapterOperations.backupSplit.changes[0].chapterSplit.existing.id)
    const appliedSplit = await api("POST", `/ai/agent/${copiedSplit.id}/apply`, { novelId: copyId, selections: [{ id: split.id }] })
    assert.equal(appliedSplit.status, 200, JSON.stringify(appliedSplit.data))
    const deleted = copiedRuns.find(run => run.changes[0]?.title === chapterOperations.backupDeletion.changes[0].title)
    const undoDeletion = await api("POST", `/ai/agent/${deleted.id}/apply`, { novelId: copyId, op: "undo" })
    assert.equal(undoDeletion.status, 200, JSON.stringify(undoDeletion.data))
    const restoredChapterId = undoDeletion.data.changes[0].appliedId
    assert.notEqual(restoredChapterId, chapterOperations.backupDeletion.changes[0].targetId)
    assert.equal((await api("GET", `/chapters/${restoredChapterId}`)).data.content, "<p>Restore me.</p>")
    const copiedMerge = copiedRuns.find(run => run.request === chapterOperations.pairBackupMerge.request)
    const mergedAwayId = copiedMerge.changes[0].chapterPair.second.id
    assert.notEqual(mergedAwayId, chapterOperations.pairBackupMerge.changes[0].chapterPair.second.id)
    const undoMerge = await api("POST", `/ai/agent/${copiedMerge.id}/apply`, { novelId: copyId, op: "undo" })
    assert.equal(undoMerge.status, 200, JSON.stringify(undoMerge.data))
    assert.equal((await api("GET", `/chapters/${mergedAwayId}`)).data.content, "<p>Restore this chapter after import.</p>")
    scriptedReplies.push("The restored conversation continues.")
    const continued = await call("POST", "/yanfield/api/ai/agent", JSON.stringify({
      novelId: copyId, sessionId: copySession.id, chapterId: copyChapter.id, previousRunId: copyRunId, message: "Continue",
    }))
    assert.match(continued.body, /The restored conversation continues/)
    assert.equal((await api("GET", messagesRoute)).data.items.length, 4)
    const repeated = await importFile(selectedFile, { ...options, mode: "copy" })
    assert.equal(repeated.status, 200)
    assert.notEqual(Object.keys(repeated.data.preferences.books)[0], copyId)

    const migrated = structuredClone(selectedManifest)
    migrated.schema = 5
    delete migrated.rows.codex_order
    assert.equal((await importFile(encode(migrated))).status, 200, "Older snapshot schemas are migrated")
    const broken = structuredClone(selectedManifest)
    broken.rows.chapters[0].volume_id = "missing-volume"
    assert.equal((await importFile(encode(broken))).status, 400)
    const interrupted = structuredClone(selectedManifest)
    const runRow = interrupted.rows.agent_runs.find(row => row.id === attemptedAgain.id)
    runRow.data = JSON.stringify({ ...JSON.parse(runRow.data), status: "running" })
    interrupted.rows.chat_messages.find(row => row.id === attemptedAgain.messageId).status = "streaming"
    const interruptedFile = encode(interrupted)
    const interruptedPreview = await importFile(interruptedFile)
    const interruptedCopy = await importFile(interruptedFile, {
      mode: "copy", ids: [novelId], fingerprint: interruptedPreview.data.fingerprint,
    })
    assert.equal(interruptedCopy.status, 200)
    const interruptedId = Object.keys(interruptedCopy.data.preferences.books)[0]
    const interruptedRun = db.prepare("SELECT data FROM agent_runs WHERE novel_id = ?").all(interruptedId)
      .map(row => JSON.parse(row.data)).find(run => run.request === attemptedAgain.request && run.status === "aborted")
    assert.equal(interruptedRun.changes[0].state, "pending")
    assert.equal(db.prepare("SELECT status FROM chat_messages WHERE id=?").get(interruptedRun.messageId).status, "aborted")
    const future = structuredClone(selectedManifest)
    future.schema = 999
    assert.equal((await importFile(encode(future))).status, 400)
    assert.equal((await importFile(selectedFile.subarray(0, selectedFile.length / 2))).status, 400)
    assert.equal((await importFile(Uint8Array.from([1, 2, 3]))).status, 400)

    const restoreOptions = { mode: "restore", password, fingerprint: full.data.fingerprint }
    let handledActiveStream = false
    scriptedReplies.push(async () => {
      const blocked = await importFile(encrypted, restoreOptions)
      assert.equal(blocked.status, 409)
      assert.match(blocked.data.error, /AI 正在运行/)
      handledActiveStream = true
      return "AI work complete"
    })
    await call("POST", "/yanfield/api/ai/agent", JSON.stringify({ novelId, message: "Hold the restore" }))
    assert.equal(handledActiveStream, true)

    await api("PATCH", novelRoute, { title: "Title at restore time" })
    await api("PATCH", "/settings", { defaultContext: { contextBudget: 16000 } })
    await api("DELETE", `/providers/${provider.id}`)
    db.exec("CREATE TRIGGER backup_fixture_abort BEFORE INSERT ON chapters BEGIN SELECT RAISE(ABORT, 'fixture'); END")
    try {
      const failed = await importFile(encrypted, restoreOptions)
      assert.equal(failed.status, 500)
      assert.equal((await api("GET", novelRoute)).data.title, "Title at restore time")
      assert.equal((await api("GET", `/novels/${copyId}`)).status, 200)
      assert.equal((await api("GET", "/settings")).data.defaultContext.contextBudget, 16000)
      assert.equal(db.prepare("SELECT id FROM providers WHERE id=?").get(provider.id), undefined)
    } finally {
      db.exec("DROP TRIGGER backup_fixture_abort")
    }
    const restored = await importFile(encrypted, restoreOptions)
    assert.equal(restored.status, 200, JSON.stringify(restored.data))
    assert.equal(restored.data.preferences.global["yanfield:theme"], "dark")
    for (const { name } of tableNames) {
      const rows = db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()
        .map(row => ({ ...row, ...(name === "providers" ? { api_key: "" } : {}) }))
      assert.deepEqual(rows, manifest.rows[name], `Full restore must round-trip ${name}`)
    }
    assert.equal((await api("GET", novelRoute)).data.title, original.title)
    assert.equal((await api("GET", `/novels/${copyId}`)).status, 404)
    assert.equal((await api("GET", "/settings")).data.defaultContext.contextBudget, 12000)
    assert.equal(db.prepare("SELECT api_key FROM providers WHERE id=?").get(provider.id).api_key, providerKey)
    assert(!(await api("GET", "/providers")).data.items.find(item => item.id === provider.id).apiKey)
    const recoveryPath = path.join(path.dirname(dbPath), restored.data.recoveryFile)
    if (process.platform !== "win32") assert.equal((await stat(recoveryPath)).mode & 0o777, 0o600)
    const recovery = new DatabaseSync(recoveryPath, { readOnly: true })
    try {
      assert.equal(recovery.prepare("PRAGMA quick_check").get().quick_check, "ok")
      assert.equal(recovery.prepare("SELECT title FROM novels WHERE id=?").get(novelId).title, "Title at restore time")
      assert(recovery.prepare("SELECT id FROM novels WHERE id=?").get(copyId))
    } finally {
      recovery.close()
    }
    const plainPreview = await importFile(plain)
    const restoredPlain = await importFile(plain, { mode: "restore", fingerprint: plainPreview.data.fingerprint })
    assert.equal(restoredPlain.status, 200)
    assert.equal(db.prepare("SELECT api_key FROM providers WHERE id=?").get(provider.id).api_key, providerKey,
      "A redacted restore must keep a matching local credential")
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), [])
    for (const { id } of (await api("GET", "/novels")).data.items) assert.equal((await api("DELETE", `/novels/${id}`)).status, 200)
    const empty = await exportFile({ scope: "all" })
    const emptyPreview = await importFile(empty)
    assert.equal(emptyPreview.status, 200)
    assert.deepEqual(emptyPreview.data.books, [])
    await api("POST", "/novels", { title: "Will be replaced by an empty library" })
    assert.equal((await importFile(empty, { mode: "restore", fingerprint: emptyPreview.data.fingerprint })).status, 200)
    await restart()
    assert.deepEqual((await api("GET", "/novels")).data.items, [], "Restoring an empty library should not seed sample books")
    console.log("[dsh-yanfield] backup smoke ok (full and selected export, duplicate import, rewired relations and AI review, continued chat, all table data, older schema, damaged files, interrupted work, encrypted keys, recovery snapshot, atomic rollback, empty restore)")
  } finally {
    db.close()
  }
}
