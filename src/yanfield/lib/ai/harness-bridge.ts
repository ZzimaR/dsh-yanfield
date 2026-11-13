/**
 * Host 与砚田 Provider 之间的窄接口。
 * 领域代码不直接 import @deepseek-ai/*，避免在 profile 里盖住宿主副本。
 */
export interface HarnessModel {
  id: string
  label: string
  /** 上下文窗口（token）；宿主目录没声明时留空。 */
  contextWindow?: number
  /** 目录里的一句话说明，用于设置页的选择器副标题。 */
  description?: string
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

/** DSH 账号钱包里的一种币种余额；金额是十进制字符串，可能带指数（例如 0E-16）。 */
export interface HarnessWallet {
  currency: "CNY" | "USD"
  balance: string
}

/** DSH 已登录账号的钱包快照：normal = 充值余额，bonus = 赠送余额。 */
export interface HarnessAccountBalance {
  wallets: HarnessWallet[]
  bonusWallets: HarnessWallet[]
}

/** 宿主里可选的一条模型路由（账号登录 / 官方 API Key）及其可用模型。 */
export interface HarnessRouteOption {
  id: string
  name: string
  /** 这条路由现在能不能直接用（官方 Key 路由要求已经保存过 API Key）。 */
  available: boolean
  /** 不能用的原因，设置页直接展示。 */
  unavailableReason?: string
  models: HarnessModel[]
}

export interface HarnessBridge {
  providerRoute(): string
  preferredProviderRoute?(): Promise<string>
  defaultModel(): string
  listProviders(): { id: string; name: string }[]
  discoverModels(route: string): Promise<HarnessModel[]>
  /** 列出所有可选路由及各自可用模型，供设置页做「账号登录 / 官方 Key」切换。 */
  listRoutes?(): Promise<HarnessRouteOption[]>
  stream(input: HarnessStreamInput): AsyncIterable<unknown>
  /**
   * 读取 DSH 已登录 DeepSeek 账号的钱包余额。
   * 宿主没有账号服务、账号未登录、或凭据失效时返回 null（由调用方决定提示文案）。
   */
  accountBalance?(): Promise<HarnessAccountBalance | null>
}

/** 服务地址形如 ``harness:deepseek-account``：取出宿主里的路由 id（浏览器侧也要用）。 */
export function harnessRouteOf(baseUrl: string | null | undefined): string | null {
  const value = typeof baseUrl === "string" ? baseUrl.trim() : ""
  if (!value.startsWith("harness:")) return null
  const route = value.slice("harness:".length).trim()
  return route.length > 0 ? route : null
}

let bridge: HarnessBridge | null = null

export function setHarnessBridge(next: HarnessBridge | null): void {
  bridge = next
}

export function getHarnessBridge(): HarnessBridge | null {
  return bridge
}
