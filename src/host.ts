import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { setHarnessBridge, type HarnessBridge, type HarnessModel, type HarnessStreamInput } from "../vendor/yanfield/lib/ai/harness-bridge"
import { handleHttp } from "./http"

export const name = "dsh-yanfield"
const PREFIX = "/yanfield"

interface PluginConfig {
  dataDir?: string
  provider?: string
  model?: string
}

function dshHome(env: NodeJS.ProcessEnv = process.env): string {
  const raw = typeof env.DSH_HOME === "string" ? env.DSH_HOME.trim() : ""
  if (raw) return path.resolve(raw)
  return path.join(os.homedir(), ".dsh")
}

function legacyDbPath(): string | null {
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    return path.join(base, "Yanfield", "yanfield.db")
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Yanfield", "yanfield.db")
  }
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
  return path.join(base, "yanfield", "yanfield.db")
}

/** 第一次启动时，如果独立砚田的库没有未合并的 WAL，复制一份进来。之后两边各写各的。 */
function adoptLegacyDatabase(target: string): void {
  if (fs.existsSync(target)) return
  const legacy = legacyDbPath()
  if (!legacy || path.resolve(legacy) === path.resolve(target) || !fs.existsSync(legacy)) return
  if (fs.existsSync(`${legacy}-wal`)) return
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(legacy, target)
}

function prepareDatabase(config: PluginConfig): void {
  const custom = typeof config.dataDir === "string" ? config.dataDir.trim() : ""
  const dir = custom ? path.resolve(custom) : path.join(dshHome(), "yanfield")
  const file = path.join(dir, "yanfield.db")
  adoptLegacyDatabase(file)
  process.env.YANFIELD_DB_PATH = file
  process.env.YANFIELD_IN_DSH = "1"
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null
}

function normalizeModels(value: unknown): HarnessModel[] {
  const list = Array.isArray(value) ? value : asRecord(value)?.models
  if (!Array.isArray(list)) return []
  const models: HarnessModel[] = []
  const seen = new Set<string>()
  for (const item of list) {
    if (typeof item === "string" && item.trim() && !seen.has(item)) {
      seen.add(item)
      models.push({ id: item.trim(), label: item.trim() })
      continue
    }
    const record = asRecord(item)
    const id = typeof record?.id === "string" ? record.id.trim() : ""
    if (!id || seen.has(id)) continue
    seen.add(id)
    const label = typeof record?.name === "string" && record.name.trim()
      ? record.name.trim()
      : typeof record?.label === "string" && record.label.trim()
        ? record.label.trim()
        : id
    models.push({ id, label })
  }
  return models
}

function createBridge(ctx: { llm?: LlmLike; get?: (name: string) => unknown }, config: PluginConfig): HarnessBridge {
  const configuredProvider = typeof config.provider === "string" ? config.provider.trim() : ""
  const configuredModel = typeof config.model === "string" && config.model.trim() ? config.model.trim() : "deepseek-flash"
  const llmOf = (): LlmLike | null => {
    if (ctx.llm && typeof ctx.llm.stream === "function") return ctx.llm
    try {
      const found = ctx.get?.("llm") as LlmLike | undefined
      if (found && typeof found.stream === "function") return found
    } catch {
      /* 模型服务还没挂上 */
    }
    return null
  }
  return {
    providerRoute() {
      if (configuredProvider) return configuredProvider
      const llm = llmOf()
      const listed = llm && typeof llm.listProviders === "function" ? llm.listProviders() : []
      return listed[0]?.id || "deepseek"
    },
    defaultModel() {
      return configuredModel
    },
    listProviders() {
      const llm = llmOf()
      if (!llm || typeof llm.listProviders !== "function") return []
      return llm.listProviders().map((item) => ({ id: String(item.id), name: String(item.name || item.id) }))
    },
    async discoverModels(route: string) {
      const llm = llmOf()
      const fallback = [{ id: configuredModel, label: `${configuredModel}（Harness）` }]
      if (!llm || typeof llm.discoverModels !== "function" || typeof llm.listConfigurableProviders !== "function") {
        return fallback
      }
      const entries = llm.listConfigurableProviders()
      const entry = entries.find((item) => item.provider === route) ?? entries[0]
      if (!entry?.settingsNs) return fallback
      try {
        const found = normalizeModels(await llm.discoverModels(entry.settingsNs, {}))
        return found.length > 0 ? found : fallback
      } catch {
        return fallback
      }
    },
    async *stream(input: HarnessStreamInput) {
      const llm = llmOf()
      if (!llm) throw Object.assign(new Error("DeepSeek Harness 的模型服务还没有就绪"), { status: 503 })
      const options: Record<string, unknown> = {
        provider: input.provider,
        model: input.model,
        messages: input.messages,
        signal: input.signal,
      }
      if (input.maxTokens && input.maxTokens > 0) options.maxTokens = input.maxTokens
      if (typeof input.temperature === "number") options.temperature = input.temperature
      if (input.reasoningEffort) options.reasoningEffort = input.reasoningEffort
      if (input.tools?.length) options.tools = input.tools
      const result = llm.stream(options)
      const iterable = isAsyncIterable(result) ? result : await result
      for await (const chunk of iterable) yield chunk
    },
  }
}

interface LlmLike {
  stream: (options: Record<string, unknown>) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>
  listProviders?: () => { id: string; name?: string }[]
  listConfigurableProviders?: () => { provider: string; settingsNs?: string }[]
  discoverModels?: (settingsNs: string, request: Record<string, unknown>) => Promise<unknown>
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(value) && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
}

export function createHttpHandler(ctx: { get?: (name: string) => unknown }) {
  return (req: NodeRequest, res: NodeResponse) => handleHttp(ctx, req, res, PREFIX)
}

export function apply(ctx: { effect?: (fn: () => void, label?: string) => void; inject?: (deps: string[], fn: (scoped: { llm?: LlmLike; get?: (name: string) => unknown }) => void) => void; get?: (name: string) => unknown; webServer?: { register: (route: { kind: string; path: string; handler: (req: NodeRequest, res: NodeResponse) => unknown }) => () => void }; llm?: LlmLike }, config?: PluginConfig): void {
  const resolved = config ?? {}
  prepareDatabase(resolved)
  setHarnessBridge(createBridge(ctx, resolved))
  if (typeof ctx.inject === "function") {
    ctx.inject(["llm"], (scoped) => {
      setHarnessBridge(createBridge({ ...ctx, llm: scoped.llm, get: scoped.get ?? ctx.get }, resolved))
    })
  }
  const handler = createHttpHandler(ctx)
  if (ctx.webServer && typeof ctx.effect === "function") {
    ctx.effect(
      () => ctx.webServer!.register({ kind: "prefix", path: PREFIX, handler }),
      "dsh-yanfield: /yanfield routes",
    )
  }
}

export { randomUUID }
export default { name, inject: ["webServer", "connection"], apply }

interface NodeRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer>
}

interface NodeResponse {
  statusCode: number
  setHeader: (name: string, value: string | number | readonly string[]) => void
  write: (chunk: Buffer) => boolean
  end: (chunk?: Buffer | string) => void
  on: (event: string, listener: () => void) => void
  headersSent?: boolean
  destroyed?: boolean
  flushHeaders?: () => void
}
