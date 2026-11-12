import { randomUUID } from "node:crypto"
import { version } from "../package.json"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { setHarnessBridge, type HarnessAccountBalance, type HarnessBridge, type HarnessModel, type HarnessRouteOption, type HarnessStreamInput } from "../vendor/yanfield/lib/ai/harness-bridge"
import { handleHttp } from "./http"
import { setPluginDbPath } from "../vendor/yanfield/lib/db"

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
  const envPath = process.env.YANFIELD_DB_PATH?.trim()
  const file = custom
    ? path.resolve(custom, "yanfield.db")
    : envPath ? path.resolve(envPath) : path.join(dshHome(), "yanfield", "yanfield.db")
  if (!custom && !envPath) adoptLegacyDatabase(file)
  setPluginDbPath(file, Boolean(custom || envPath))
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
    const context = asRecord(record?.context)
    const contextWindow = typeof record?.contextWindow === "number" && record.contextWindow > 0
      ? record.contextWindow
      : typeof context?.contextWindow === "number" && context.contextWindow > 0
        ? context.contextWindow
        : undefined
    const description = typeof record?.description === "string" && record.description.trim() ? record.description.trim() : undefined
    models.push({ id, label, ...(contextWindow ? { contextWindow } : {}), ...(description ? { description } : {}) })
  }
  return models
}

interface AccountBalanceOutcomeLike {
  status?: unknown
  value?: unknown
  bonusWallets?: unknown
}

/** DSH 的账号服务（cordis 服务名 deepseekAccount），由 @deepseek-ai/dsh-deepseek-account 提供。 */
interface DeepSeekAccountStateLike {
  /** ``credential-stored`` 表示本机已经存了登录凭据（``signed-out`` 表示没登录）。 */
  status?: unknown
}

interface DeepSeekAccountLike {
  getBalance?: (client: {
    version: string
    locale: string
    timezoneOffsetSeconds: number
  }) => Promise<AccountBalanceOutcomeLike | null | undefined>
  getState?: () => Promise<DeepSeekAccountStateLike | null | undefined>
}

/** 账号接口要求「东经为正」的秒偏移，getTimezoneOffset 正好相反。 */
function accountClientMetadata() {
  return {
    version: `dsh-yanfield/${version}`,
    locale: "zh-CN",
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
}

function normalizeWallets(value: unknown): HarnessAccountBalance["wallets"] {
  if (!Array.isArray(value)) return []
  const wallets: HarnessAccountBalance["wallets"] = []
  for (const entry of value) {
    const wallet = asRecord(entry)
    const currency = wallet?.currency
    const balance = wallet?.balance
    if ((currency === "CNY" || currency === "USD") && typeof balance === "string" && balance.trim()) {
      wallets.push({ currency, balance })
    }
  }
  return wallets
}

function createBridge(ctx: { llm?: LlmLike; get?: (name: string) => unknown; deepseekAccount?: DeepSeekAccountLike }, config: PluginConfig): HarnessBridge {
  const configuredProvider = typeof config.provider === "string" ? config.provider.trim() : ""
  const configuredModel = typeof config.model === "string" && config.model.trim() ? config.model.trim() : "deepseek-flash"
  const llmOf = (): LlmLike | null => {
    try {
      if (ctx.llm && typeof ctx.llm.stream === "function") return ctx.llm
    } catch {
      /* llm 还未注入 */
    }
    try {
      const found = ctx.get?.("llm") as LlmLike | undefined
      if (found && typeof found.stream === "function") return found
    } catch {
      /* 模型服务还没挂上 */
    }
    return null
  }
  /**
   * 账号服务可能晚于插件加载，所以每次查询都现取。
   * 注意：没 inject 时直接属性访问会抛（cordis 的严格属性），所以两种取法都包在 try 里。
   */
  const accountOf = (): DeepSeekAccountLike | null => {
    try {
      const direct = ctx.deepseekAccount
      if (direct && (typeof direct.getBalance === "function" || typeof direct.getState === "function")) return direct
    } catch {
      /* 没有 inject，属性访问会被拒 */
    }
    try {
      const found = ctx.get?.("deepseekAccount") as DeepSeekAccountLike | undefined
      if (found && (typeof found.getBalance === "function" || typeof found.getState === "function")) return found
    } catch {
      /* 账号服务还没挂上 */
    }
    return null
  }
  /** DSH 的 credentials 服务：用来判断「官方 API Key」路由是否已经存过 Key。 */
  const credentialsOf = (): { resolve?: (ref: string) => Promise<{ value?: unknown } | undefined> } | null => {
    try {
      const found = ctx.get?.("credentials") as { resolve?: (ref: string) => Promise<{ value?: unknown } | undefined> } | undefined
      if (found && typeof found.resolve === "function") return found
    } catch {
      /* 凭据服务还没挂上 */
    }
    return null
  }
  /**
   * 读取 DSH 的模型目录。``llm.listModels(route)`` 是离线目录（账号路由未登录也能读），
   * 再用 ``resolveModelInfo`` 补上下文窗口；``discoverModels`` 只对注册了发现的第三方服务有意义。
   */
  const catalogOf = async (route: string): Promise<HarnessModel[]> => {
    const llm = llmOf()
    const provider = route.startsWith("harness:") ? route.slice("harness:".length) : route
    if (!llm || typeof llm.listModels !== "function") return deepseekCatalogFallback(provider)
    const models = normalizeModels(await llm.listModels(provider))
    for (const model of models) {
      if (typeof llm.resolveModelInfo !== "function") continue
      try {
        const info = asRecord(await llm.resolveModelInfo(provider, model.id))
        const context = asRecord(info?.context)
        if (typeof context?.contextWindow === "number" && context.contextWindow > 0) model.contextWindow = context.contextWindow
        if (typeof info?.description === "string" && info.description.trim()) model.description = info.description.trim()
      } catch {
        /* 目录条目已经够用，取不到窗口信息就跳过 */
      }
    }
    // 官方 Key 路由在没存 Key 时目录为空；这时仍要能把 flash / pro 列出来，
    // 用户切过去之后再填 Key 就能直接用。
    return models.length > 0 ? models : deepseekCatalogFallback(provider)
  }
  /** 判断一条路由现在能不能直接用：账号路由看登录状态，官方 Key 路由看有没有存 Key。 */
  const routeAvailability = async (route: string): Promise<{ available: boolean; unavailableReason?: string }> => {
    if (route === OFFICIAL_PROVIDER_ROUTE) {
      try {
        const credentials = credentialsOf()
        const hit = credentials?.resolve ? await credentials.resolve(OFFICIAL_API_KEY_REF) : undefined
        if (hit && typeof hit.value === "string" && hit.value.trim()) return { available: true }
      } catch {
        /* 读到异常按未保存处理 */
      }
      if (process.env[OFFICIAL_API_KEY_REF]?.trim()) return { available: true }
      return { available: false, unavailableReason: "还没有保存 DeepSeek API Key：在 DSH 的模型服务页填写，或设置 DEEPSEEK_API_KEY 环境变量" }
    }
    if (route === ACCOUNT_PROVIDER_ROUTE) {
      const account = accountOf()
      if (!account?.getState) return { available: false, unavailableReason: "账号服务暂时无法确认登录状态" }
      try {
        const state = await account.getState()
        if (state?.status === "credential-stored") return { available: true }
        return { available: false, unavailableReason: "还没有登录 DeepSeek 账号：在 DSH 里登录后即可直接用" }
      } catch {
        return { available: false, unavailableReason: "账号服务暂时读不到登录状态" }
      }
    }
    return { available: true }
  }
  return {
    providerRoute() {
      if (configuredProvider) return configuredProvider
      const llm = llmOf()
      const listed = llm && typeof llm.listProviders === "function" ? llm.listProviders() : []
      // DSH 里通常已经登录了 DeepSeek 账号：账号路由不需要再填一把 API Key，
      // 比 ``deepseek-official``（要 DEEPSEEK_API_KEY）更适合当默认值。
      if (listed.some((item) => item.id === ACCOUNT_PROVIDER_ROUTE)) return ACCOUNT_PROVIDER_ROUTE
      return listed[0]?.id || "deepseek"
    },
    async preferredProviderRoute() {
      if (configuredProvider) return configuredProvider
      const listed = this.listProviders().map((item) => item.id)
      const preferred = [ACCOUNT_PROVIDER_ROUTE, OFFICIAL_PROVIDER_ROUTE, ...listed]
      for (const route of new Set(preferred)) {
        if (listed.includes(route) && (await routeAvailability(route)).available) return route
      }
      return this.providerRoute()
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
      return catalogOf(route)
    },
    async listRoutes() {
      const llm = llmOf()
      if (!llm || typeof llm.listProviders !== "function") return []
      const routes: HarnessRouteOption[] = []
      for (const item of llm.listProviders()) {
        const id = String(item.id)
        let models: HarnessModel[] = []
        try {
          models = await catalogOf(id)
        } catch {
          models = []
        }
        const status = await routeAvailability(id)
        routes.push({ id, name: routeDisplayName(id, item.name), ...status, models })
      }
      return routes
    },
    async accountBalance() {
      const account = accountOf()
      if (!account?.getBalance) return null
      const outcome = await account.getBalance(accountClientMetadata())
      // 未登录 / 凭据缺失时 SDK 返回 null；网络或解析失败时返回 {status:"failed"}，两者要分开提示。
      if (!outcome) return null
      if (outcome.status !== "ready") throw new Error("账号服务暂时无法返回余额，请稍后重试")
      return { wallets: normalizeWallets(outcome.value), bonusWallets: normalizeWallets(outcome.bonusWallets) }
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
      // 旧版本把 harness 服务固定到 ``deepseek-official``（需要 API Key）。用户是账号登录时
      // 那条路由会抛 MISSING_CREDENTIAL，这里自动改用账号路由重试，免得旧数据报错。
      const routes = [input.provider]
      if (input.provider === OFFICIAL_PROVIDER_ROUTE && availableAccountRoute(llm)) routes.push(ACCOUNT_PROVIDER_ROUTE)
      let lastError: unknown = null
      for (const route of routes) {
        let delivered = false
        try {
          const result = llm.stream({ ...options, provider: route })
          const iterable = isAsyncIterable(result) ? result : await result
          for await (const chunk of iterable) {
            delivered = true
            yield chunk
          }
          return
        } catch (error) {
          // 已经吐出内容就不能重试，否则会重复输出。
          if (delivered || !isMissingCredential(error)) throw error
          if (route === OFFICIAL_PROVIDER_ROUTE && !(await routeAvailability(ACCOUNT_PROVIDER_ROUTE)).available) throw error
          lastError = error
        }
      }
      throw lastError ?? new Error("DeepSeek Harness 的模型服务暂时不可用")
    },
  }
}

interface LlmLike {
  stream: (options: Record<string, unknown>) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>
  listProviders?: () => { id: string; name?: string }[]
  listConfigurableProviders?: () => { provider: string; settingsNs?: string }[]
  discoverModels?: (settingsNs: string, request: Record<string, unknown>) => Promise<unknown>
  listModels?: (provider: string) => Promise<unknown>
  resolveModelInfo?: (provider: string, model: string) => Promise<unknown>
}

/** DSH 账号登录环境下的默认路由（``dsh-llm-deepseek-account`` 注册的 provider id）。 */
const ACCOUNT_PROVIDER_ROUTE = "deepseek-account"
/** 官方 API Key 路由（``dsh-llm-deepseek-api-key`` 注册的 provider id），需要 DEEPSEEK_API_KEY。 */
const OFFICIAL_PROVIDER_ROUTE = "deepseek-official"
/** 官方 Key 路由读取的凭据名（与 ``credentialRef("DEEPSEEK_API_KEY")`` 一致）。 */
const OFFICIAL_API_KEY_REF = "DEEPSEEK_API_KEY"

/**
 * DeepSeek 两条路由在宿主目录读不到时用的兜底目录。
 * 与 DSH 内置目录一致：``deepseek-flash``（V4.1-Flash）与 ``deepseek-v4-pro``（V4-Pro），都是 1M 上下文。
 */
const DEEPSEEK_FALLBACK_MODELS: HarnessModel[] = [
  { id: "deepseek-flash", label: "DeepSeek-V4.1-Flash", contextWindow: 1048576 },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek-V4-Pro",
    contextWindow: 1048576,
    description: "更强的推理与写作质量，价格更高；适合复杂或质量优先的任务。",
  },
]

function deepseekCatalogFallback(provider: string): HarnessModel[] {
  if (provider === OFFICIAL_PROVIDER_ROUTE || provider === ACCOUNT_PROVIDER_ROUTE) {
    return DEEPSEEK_FALLBACK_MODELS.map((model) => ({ ...model }))
  }
  return []
}

function availableAccountRoute(llm: LlmLike): string | null {
  if (typeof llm.listProviders !== "function") return null
  try {
    return llm.listProviders().some((item) => item.id === ACCOUNT_PROVIDER_ROUTE) ? ACCOUNT_PROVIDER_ROUTE : null
  } catch {
    return null
  }
}

/** 给设置页看的路由名字：账号登录 vs 官方 API Key。 */
function routeDisplayName(id: string, fallback: string | undefined): string {
  if (id === "deepseek-account") return "DeepSeek 账号登录"
  if (id === "deepseek-official") return "DeepSeek 官方 API Key"
  return fallback && fallback.trim() ? fallback.trim() : id
}

/** 路由不可用时给用户能看懂的一句话，而不是把宿主原始报错抛到界面上。 */
function routeUnavailableReason(error: unknown): string {
  const record = asRecord(error)
  const code = typeof record?.code === "string" ? record.code : ""
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  if (code === "ACCOUNT_SIGN_IN_REQUIRED" || /sign in to deepseek/i.test(message)) return "还没有登录 DeepSeek 账号"
  if (code === "MISSING_CREDENTIAL" || /no API key/i.test(message)) return "还没有保存 DeepSeek API Key"
  if (/fetch|network|ENOTFOUND|ETIMEDOUT/i.test(message)) return "网络请求失败"
  return message.trim() || "这条路由暂时不可用"
}

/** 路由缺少凭据（例如没配 DEEPSEEK_API_KEY）时 DSH 抛的是 MISSING_CREDENTIAL。 */
function isMissingCredential(error: unknown): boolean {
  const record = asRecord(error)
  const code = record?.code
  if (typeof code === "string" && code === "MISSING_CREDENTIAL") return true
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return /no API key for provider route/i.test(message) || /MISSING_CREDENTIAL/.test(message)
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
      setHarnessBridge(createBridge({
        llm: scoped.llm,
        get: (name) => scoped.get?.(name) ?? ctx.get?.(name),
      }, resolved))
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
