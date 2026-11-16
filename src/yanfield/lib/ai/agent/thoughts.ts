import type { ProviderChunk } from "@/lib/ai/provider"
import type { AiStreamEvent } from "@/lib/types"
import { uid } from "@/lib/ui/cn"
import type { AgentRun, AgentThought } from "./types"

export async function* streamThoughts(run: AgentRun, chunks: AsyncIterable<ProviderChunk>, withinStep = false):
  AsyncGenerator<ProviderChunk | Extract<AiStreamEvent, { type: "agent-thinking" }>> {
  const position = { stepIndex: run.steps.length - Number(withinStep), withinStep }
  const start = (): AgentThought => ({ id: uid("thought"), ...position, text: "" })
  let thought: AgentThought | undefined = start()
  const archive = (entry: AgentThought) => {
    if (entry.text.trim()) (run.thoughts ??= []).push(entry)
  }

  try {
    yield { type: "agent-thinking", phase: "start", thought: { ...thought } }
    for await (const chunk of chunks) {
      if (chunk.type === "reasoning") {
        thought ??= start()
        thought.text += chunk.text
        yield { type: "agent-thinking", phase: "delta", thought: { ...thought, text: chunk.text } }
      } else if (thought && (chunk.type === "tool-calls" || (chunk.type === "delta" && chunk.text.trim()))) {
        const finished = thought
        thought = undefined
        archive(finished)
        yield { type: "agent-thinking", phase: "end", thought: finished }
      }
      yield chunk
    }
  } finally {
    if (thought) archive(thought)
  }
  if (thought) yield { type: "agent-thinking", phase: "end", thought }
}
