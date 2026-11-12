/**
 * Host 与砚田 Provider 之间的窄接口。
 * 领域代码不直接 import @deepseek-ai/*，避免在 profile 里盖住宿主副本。
 */
export interface HarnessModel {
  id: string
  label: string
}

export interface HarnessStreamInput {
  provider: string
  model: string
  messages: unknown[]
  maxTokens?: number
  temperature?: number
  reasoningEffort?: string
  tools?: unknown[]
  signal?: AbortSignal
}

export interface HarnessBridge {
  providerRoute(): string
  defaultModel(): string
  listProviders(): { id: string; name: string }[]
  discoverModels(route: string): Promise<HarnessModel[]>
  stream(input: HarnessStreamInput): AsyncIterable<unknown>
}

let bridge: HarnessBridge | null = null

export function setHarnessBridge(next: HarnessBridge | null): void {
  bridge = next
}

export function getHarnessBridge(): HarnessBridge | null {
  return bridge
}
