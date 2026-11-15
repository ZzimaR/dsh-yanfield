import { isOutputLimitError, streamCompletion, type AiMessage, type ProviderChunk } from "@/lib/ai/provider"
import { resolveTarget } from "@/lib/ai/engine"
import { thinkingProfile } from "@/lib/ai/thinking"
import { withLanguageDirective } from "@/lib/ai/prompts"
import { estimateTokens } from "@/lib/ui/cn"
import type { ContextConfig } from "@/lib/types"
import type { AgentRequest, AgentRun } from "./types"
import { agentTools } from "./tools"

export function messageTokens(message: AiMessage): number {
  return estimateTokens(message.content + (message.reasoning_content ?? "")) + 4 +
    (message.toolCalls?.reduce((total, call) => total + estimateTokens(call.name + call.input) + 8, 0) ?? 0)
}
export const toolTokens = estimateTokens(JSON.stringify(agentTools))

export function createCompletion(target: ReturnType<typeof resolveTarget>, config: ContextConfig, request: AgentRequest,
  run: AgentRun, checkpoint: () => void, signal?: AbortSignal) {
  let calls = 0
  let pricedCalls = 0
  const thinking = thinkingProfile(target.provider, target.model)
  const deepThinking = thinking.adapter === "deepseek" && target.thinkingLevel !== "off"
  const locale = request.locale ?? "zh"
  const instruction = request.message.replace(/「[^」]*」|『[^』]*』|“[^”]*”|"[^"\n]*"|`[^`]*`/g, " ")
  const han = instruction.match(/\p{Script=Han}/gu)?.length ?? 0
  const english = instruction.match(/[A-Za-z]{2,}/g)?.length ?? 0
  const authorLanguage = han >= 4 && han >= english ? "Chinese" : english >= 3 && english > han ? "English" : undefined
  const languageReminder = authorLanguage
    ? `\nThe author's current instruction is in ${authorLanguage}. Write all replies and new material in ${authorLanguage}, unless the author explicitly asks for a different language. Preserve names and verbatim quotations.`
    : ""

  return async function* complete(messages: AiMessage[], options: {
    tools?: boolean; structured?: boolean; shortWrite?: boolean; temperature?: number
  } = {}): AsyncGenerator<ProviderChunk> {
    const input = messages.map(message => message.role === "system" ? {
      ...message, content: withLanguageDirective(message.content, locale) + languageReminder,
    } : message)
    const thinkingLevel = options.shortWrite && thinking.options.some(option => option.value === "low")
      ? "low" : target.thinkingLevel
    const tools = options.tools ? agentTools : undefined
    let usage: Extract<ProviderChunk, { type: "usage" }> | undefined
    let outputTokens = 0
    const maxTokens = config.maxTokens || undefined
    try {
      for await (const chunk of streamCompletion({
        provider: target.provider, model: target.model, messages: input, maxTokens, signal, tools,
        temperature: options.temperature ?? 0.4, thinkingLevel, disableThinking: !deepThinking,
        outputFormat: options.structured && target.provider.kind === "deepseek" ? "json" : undefined,
      })) {
        signal?.throwIfAborted()
        if (chunk.type === "usage") usage = chunk
        if (chunk.type === "delta" || chunk.type === "reasoning") outputTokens += estimateTokens(chunk.text)
        if (chunk.type === "tool-calls") outputTokens += estimateTokens(JSON.stringify(chunk.calls))
        if (chunk.type !== "reasoning" || deepThinking) yield chunk
      }
      signal?.throwIfAborted()
    } catch (error) {
      if (isOutputLimitError(error) && maxTokens) outputTokens = maxTokens
      throw error
    } finally {
      calls++
      if (usage?.cost && (!run.usage.reportedCost || run.usage.reportedCost.currency === usage.cost.currency)) {
        pricedCalls++
        run.usage.reportedCost = { ...usage.cost, amount: (run.usage.reportedCost?.amount ?? 0) + usage.cost.amount, complete: false }
      }
      if (run.usage.reportedCost) run.usage.reportedCost.complete = pricedCalls === calls
      run.usage.estimatedTokens = Boolean(run.usage.estimatedTokens || !usage)
      run.usage.promptTokens += usage?.promptTokens ?? (input.reduce((sum, message) => sum + messageTokens(message), 0) + (tools ? toolTokens : 0))
      run.usage.completionTokens += usage?.completionTokens ?? outputTokens
      if (usage?.cachedInputTokens !== undefined) {
        run.usage.cachedInputTokens = (run.usage.cachedInputTokens ?? 0) + usage.cachedInputTokens
        run.usage.cacheReportedInputTokens = (run.usage.cacheReportedInputTokens ?? 0) + usage.promptTokens
      }
      checkpoint()
    }
  }
}

export type Complete = ReturnType<typeof createCompletion>
