/** Recover replies saved by older builds when a terminal tool call leaked into the summary. */
export function displayAgentReply(text: string): string {
  const parts = text.trimStart().split(/\r?\n\r?\n/)
  const first = parts[0]
  if (!first.startsWith("{")) return text
  try {
    const value = JSON.parse(first)
    const reply = terminalReply(value)
    return reply === undefined ? text : [reply, ...parts.slice(1)].join("\n\n")
  } catch {
    return text
  }
}

export function terminalReply(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("calls" in value) || !Array.isArray(value.calls) || value.calls.length !== 1) return
  const [call] = value.calls
  if (call?.name === "respond" && typeof call.args?.message === "string" && call.args.message.trim()) {
    return call.args.message.trim()
  }
}
