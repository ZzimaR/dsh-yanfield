import { z } from "zod"
import * as repo from "@/lib/repo"
import { extractJson, renderTemplate, resolvePreset } from "@/lib/ai/prompts"
import { countWords, stripHtml, uid } from "@/lib/ui/cn"
import type { AiStreamEvent, ContextConfig, Novel } from "@/lib/types"
import { candidateContext, writerMessages } from "./context"
import { messageTokens, type Complete } from "./complete"
import { applyProsePatches, editProse, prepareProseEdit, writerPlainText } from "./prose-edit"
import { proseHtml } from "./schema"
import { propose, supersedeRun, validateLinks } from "./store"
import { streamThoughts } from "./thoughts"
import type { proseSchema } from "./tools"
import type { AgentRequest, AgentRun, Fields } from "./types"
import type { Workspace } from "./workspace"

export function proseEditor(novel: Novel, request: AgentRequest, config: ContextConfig, run: AgentRun,
  workspace: Workspace, complete: Complete, budget: number, previous?: AgentRun, signal?: AbortSignal) {
  const appendBases = new Map<string, string>()
  const material = workspace.materials
  const read = workspace.read
  let generations = 0

  return async function* edit(input: z.infer<typeof proseSchema>): AsyncGenerator<AiStreamEvent, Fields> {
    const { id, mode, instruction } = input
    const proseSelection = config.includeSelection ? request.selection : undefined
    const draft = id ? workspace.candidate("chapter", id) : undefined
    const copiedPrior = draft && previous?.changes.includes(draft)
    const candidate = copiedPrior ? { ...structuredClone(draft), id: uid("change") } : draft
    const actualId = candidate?.targetId ?? (candidate ? null : id ?? null)
    const seen = id ? workspace.observed.get(`chapter:${id}`) : undefined
    if (draft && !seen) throw new Error("修改前请先读取目标对象")

    if (request.writingPreset && (mode !== (request.writingPreset === "continue" ? "append" : "selection") || id !== run.chapterId)) {
      throw new Error(request.writingPreset === "continue" ? "请对当前章节使用 append 模式" : "请对当前章节使用 selection 模式")
    }
    if (mode === "selection" && (!proseSelection || !actualId || actualId !== run.chapterId || candidate)) {
      throw new Error("当前没有对应章节的选区，请选择后重试")
    }
    if (id && !candidate && !seen && !(id === run.chapterId && (mode === "selection" || mode === "append"))) {
      throw new Error("改正文前请先读取目标章节")
    }
    const source = candidate ? candidateContext(candidate) : seen ?? (id ? read("chapter", id) : null)
    if (!id && mode === "rewrite") {
      validateLinks("chapter", { volumeId: input.volumeId }, novel.id, null)
      if (input.title && workspace.chapters.some(({ chapter }) => chapter.title === input.title && chapter.volumeId === (input.volumeId ?? null))) {
        throw new Error("章节标题或序号已被占用")
      }
    }
    if (id && !source) throw new Error("要修改的对象不存在")
    if (mode === "rewrite" && id && stripHtml(String(source?.content ?? "")) &&
      (workspace.chapterPages.get(id) ?? 0) < String(source?.content ?? "").length) {
      throw new Error("改写整章前请按 nextOffset 读完正文")
    }

    const proposedNewCount = run.changes.filter(change => change.kind === "chapter" && !change.targetId && change.state === "pending").length
    const title = mode === "rewrite" && !actualId && !candidate ? input.title ?? `第 ${workspace.chapters.length + proposedNewCount + 1} 章`
      : String(source?.title ?? candidate?.title ?? "")
    if (mode !== "patch" && generations++ >= 6) throw new Error("已达到本轮写作次数上限，请审阅现有候选")
    const words = (mode === "patch" ? undefined : input.words) ?? (mode === "selection" ? Math.max(1, countWords(proseSelection ?? "")) : 2000)
    const targetWords = mode === "append" || mode === "rewrite" ? input.words : undefined
    const minimumWords = mode === "append" || mode === "rewrite"
      ? input.minimumWords ?? (targetWords ? Math.ceil(targetWords * 0.85) : undefined) : undefined
    const sourceHtml=String(source?.content??"")
    const selectedEdit = mode==="selection" ? prepareProseEdit(sourceHtml,proseSelection!,request.selectionReference) : undefined
    const priorAppendBase = draft && appendBases.get(draft.id)
    const appendBase = mode === "append" ? priorAppendBase ?? sourceHtml : ""
    const appendDraft = mode === "append" && priorAppendBase !== undefined ? sourceHtml.slice(appendBase.length) : undefined
    const manuscript=stripHtml(sourceHtml)
    const selectedFrom=request.selectionReference?.from ?? (proseSelection ? manuscript.indexOf(proseSelection) : -1)
    const writerSource=mode==="append"?{title:source?.title,content:stripHtml(appendBase).slice(-2800),wordCount:countWords(appendBase)}:mode==="selection"?{
      title:source?.title,content:proseSelection,
      ...(proseSelection&&selectedFrom>=0&&manuscript.slice(selectedFrom,selectedFrom+proseSelection.length)===proseSelection?{
        before:manuscript.slice(Math.max(0,selectedFrom-600),selectedFrom),
        after:manuscript.slice(selectedFrom+proseSelection.length,selectedFrom+proseSelection.length+600),
      }:{}),
    }:source
    if(mode==="append"&&actualId&&config.includeChapterBlueprint&&!material.has(`blueprint:${actualId}`)) read("blueprint",actualId)
    run.preview=""
    let content: string
    let generated: number
    if(mode==="patch") {
      content=editProse(sourceHtml,input.edits)
      generated=input.edits.reduce((total,edit)=>total+countWords(edit.replacement),0)
    } else {
      const feature = mode === "append" ? "continue" : mode === "selection" && request.writingPreset !== "continue" ? request.writingPreset : undefined
      const preset = feature && resolvePreset(feature, repo.listPresets(novel.id), undefined, request.locale)
      const presetVars = {
        words, ratio: 1.6, message: request.message, instruction, selection: proseSelection,
        chapterTitle: typeof source?.title === "string" ? source.title : undefined,
        tail: mode === "append" ? stripHtml(appendBase).slice(-2800) : undefined,
        chapterGoal: actualId ? String((material.get(`blueprint:${actualId}`) as Fields | undefined)?.goal ?? "") : undefined,
      }
      const writer=writerMessages({style:config.includeStyleGuide?novel.styleGuide:"",customInstruction:config.customInstruction,forbiddenWords:novel.forbiddenWords,materials:[...material.entries()],currentKey:actualId?`chapter:${actualId}`:undefined,current:writerSource,request:request.message,instruction,words,minimumWords,mode,appendDraft,selection:selectedEdit?.fragments,changes:run.changes.filter(c=>c.kind!=="chapter"&&c.state==="pending").map(c=>({kind:c.kind,...c.after})),preset: preset ? {
        system: renderTemplate(preset.systemPrompt, presetVars),
        user: renderTemplate(preset.userTemplate, presetVars),
      } : undefined})
      const temperature = preset ? preset.temperature : undefined
      if(budget>0&&writer.reduce((total, message) => total + messageTokens(message), 0)>budget) throw new Error("写作材料超过上下文预算，请提高预算或缩小范围")
      const shortWrite = mode === "selection" || words <= 800
      let output=""
      if(selectedEdit) {
        const schema=z.object({replacements:z.array(z.object({
          id:z.number().int(),text:z.string().trim().min(1).refine(text=>!/[\r\n\u2028\u2029]|<\/?[a-z][^>]*>/i.test(text)),
        }).strict())}).strict()
        const allowed = new Set(selectedEdit.fragments.map(fragment=>fragment.id))
        let revision: { patches: ReturnType<typeof selectedEdit.patches>; words: number } | undefined
        for(let attempt=0;attempt<2;attempt++) {
          output=""
          for await (const chunk of streamThoughts(run, complete(writer, { shortWrite, structured: true, temperature }), true)) {
            if (chunk.type === "agent-thinking") yield chunk
            if (chunk.type === "delta") output += chunk.text
          }
          if(signal?.aborted) throw new DOMException("已停止","AbortError")
          const result=schema.safeParse(extractJson(output))
          if(result.success) {
            const replacements=new Map(result.data.replacements.map(({id,text})=>[id,text]))
            if(replacements.size===result.data.replacements.length && [...replacements.keys()].every(id=>allowed.has(id))) {
              revision={
                patches:selectedEdit.patches(replacements),
                words:[...replacements.values()].reduce((total,text)=>total+countWords(text),0),
              }
              break
            }
          }
          writer.push({role:"user",content:"按指定 JSON 格式返回替换文字。只使用 selection 中的编号，每个编号最多出现一次，文字不能包含换行或 HTML。"})
        }
        if(!revision) throw new Error("修订未能保留原来的段落结构，请重试或缩小选区")
        if(!revision.patches.length) throw new Error("内容没有变化")
        content=applyProsePatches(sourceHtml,revision.patches)
        generated=revision.words
      } else {
        let best = ""
        for (let attempt = 0; attempt < 2; attempt++) {
          output = ""
          for await (const chunk of streamThoughts(run, complete(writer, { shortWrite, temperature }), true)) {
            if (chunk.type === "agent-thinking") yield chunk
            if (chunk.type !== "delta") continue
            output += chunk.text
            if (!attempt) {
              run.preview += chunk.text
              yield { type: "agent-preview", runId: run.id, text: chunk.text }
            }
          }
          signal?.throwIfAborted()
          const prose = writerPlainText(output)
          if (countWords(prose) > countWords(best)) best = prose
          if (!minimumWords || countWords(best) >= minimumWords) break
          if (!attempt && best) {
            writer.push({ role: "assistant", content: best })
            writer.push({ role: "user", content: JSON.stringify({
              actualWords: countWords(best), minimumWords, targetWords: words,
              instruction: "上一稿没到字数。完整重写上一稿，把已写的场景展开到目标字数。保留作者要求的事实和顺序；只输出这次任务的完整正文，不输出字数或解释。",
            }) })
          }
        }
        if (!best) throw new Error("模型未返回内容")
        generated = countWords(best)
        content = (mode === "append" ? appendBase : "") + proseHtml(best)
      }
    }

    if (priorAppendBase !== undefined && !content.startsWith(priorAppendBase)) {
      throw new Error("本轮为追加任务，不能改动原文，请只修订新增段落")
    }
    if (content === sourceHtml) throw new Error("内容没有变化")
    signal?.throwIfAborted()
    const change = candidate ?? propose(run, "chapter", actualId, actualId
      ? { content } : { title, content, volumeId: mode === "rewrite" ? input.volumeId ?? null : null }, instruction, title, undefined, false)
    if (candidate) change.after = { ...change.after, content }
    if (copiedPrior && previous && draft) {
      const dependents = previous.changes.filter(child => child.state === "pending" &&
        (child.targetId === draft.id || child.evidence?.some(evidence => evidence.candidate && evidence.sourceId === draft.id)))
      const children = input.reviseDependentNotes ? dependents : []
      const manuscript = stripHtml(content)
      if (children.some(child => child.evidence?.some(evidence => evidence.sourceId === draft.id && !manuscript.includes(evidence.quote)))) {
        throw new Error("修订后找不到候选资料引用的原文，请更新对应依据")
      }
      const inherited = children.map(child => {
        const next = { ...structuredClone(child), id: uid("change") }
        if (next.targetId === draft.id) next.targetId = change.id
        for (const evidence of next.evidence ?? []) if (evidence.candidate && evidence.sourceId === draft.id) evidence.sourceId = change.id
        return next
      })
      run.changes.push(change, ...inherited)
      try {
        if (!dependents.length || input.reviseDependentNotes) {
          supersedeRun(run, previous, [draft.id, ...children.map(child => child.id)])
        }
      } catch (error) {
        run.changes.splice(-1 - inherited.length)
        throw error
      }
    } else if (actualId && !candidate && source) {
      change.before = source
    }
    if (mode === "append") appendBases.set(change.id, appendBase)
    workspace.chapterPages.delete(change.id)
    if (actualId) workspace.chapterPages.delete(actualId)
    run.preview = ""
    return { changeId: change.id, title, state: "pending", words: countWords(content), generatedWords: generated,
      ...(minimumWords ? { minimumWords, targetWords, mode } : {}) }
  }
}
