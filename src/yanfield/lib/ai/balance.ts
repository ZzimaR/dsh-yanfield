import type { ProviderConfig } from "@/lib/types";
import { ProviderError } from "./provider";
import { getHarnessBridge, type HarnessWallet } from "./harness-bridge";

export interface ProviderBalance {
  isAvailable: boolean;
  balances: { currency: "CNY" | "USD"; total: string; granted: string; toppedUp: string }[];
  fetchedAt: string;
}

/** 只有 DeepSeek 官方直连地址才能用 API Key 查余额。 */
export function supportsBalance(provider: Pick<ProviderConfig, "baseUrl">): boolean {
  try {
    return new URL(provider.baseUrl).hostname === "api.deepseek.com";
  } catch {
    return false;
  }
}

/**
 * Harness 通道没有 API Key，余额由宿主去问 DSH 已登录账号。
 * 注意：这段代码同时跑在浏览器里，浏览器侧没有 bridge，所以这里只按 kind 判断；
 * 宿主真没有账号服务时由 getHarnessAccountBalance() 给出可读错误。
 */
export function supportsAccountBalance(provider: Pick<ProviderConfig, "kind">): boolean {
  return provider.kind === "harness";
}

/** 面板底栏与设置页共用的「是否显示余额入口」判断。 */
export function providerShowsBalance(provider: Pick<ProviderConfig, "kind" | "baseUrl">): boolean {
  return supportsBalance(provider) || supportsAccountBalance(provider);
}

function formatAmount(value: number, fallback: string): string {
  return Number.isFinite(value) ? value.toFixed(2) : fallback;
}

/** 把 DSH 钱包快照折算成面板需要的 total/granted/toppedUp 三段。 */
function mergeWallets(
  normal: HarnessWallet[],
  bonus: HarnessWallet[],
): ProviderBalance["balances"] {
  const currencies: Array<"CNY" | "USD"> = [];
  for (const wallet of [...normal, ...bonus]) {
    if (!currencies.includes(wallet.currency)) currencies.push(wallet.currency);
  }
  // 人民币优先，与面板「余额 ¥xx」的主展示顺序一致。
  currencies.sort((left, right) => (left === "CNY" ? -1 : right === "CNY" ? 1 : 0));
  const totalOf = (wallet: HarnessWallet[]) =>
    wallet.reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
  return currencies.map((currency) => {
    const toppedUp = totalOf(normal.filter((item) => item.currency === currency));
    const granted = totalOf(bonus.filter((item) => item.currency === currency));
    const total = toppedUp + granted;
    return {
      currency,
      total: formatAmount(total, String(total)),
      granted: formatAmount(granted, String(granted)),
      toppedUp: formatAmount(toppedUp, String(toppedUp)),
    };
  });
}

async function getHarnessAccountBalance(): Promise<ProviderBalance> {
  const bridge = getHarnessBridge();
  if (!bridge?.accountBalance) throw new ProviderError("此服务暂未接入官方余额查询", 400);
  let snapshot;
  try {
    snapshot = await bridge.accountBalance();
  } catch (error) {
    const detail = error instanceof Error && error.message ? `：${error.message}` : "";
    throw new ProviderError(`余额查询失败${detail}`, 502);
  }
  if (!snapshot) {
    throw new ProviderError(
      "没有读到已登录的 DeepSeek 账号：请先在 DSH 里登录 DeepSeek 账号，或给这个服务填官方 API Key",
      400,
    );
  }
  const balances = mergeWallets(snapshot.wallets, snapshot.bonusWallets);
  return {
    isAvailable: balances.some((item) => Number(item.total) > 0),
    balances,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getProviderBalance(provider: ProviderConfig): Promise<ProviderBalance> {
  if (provider.kind === "harness") return getHarnessAccountBalance();
  if (!supportsBalance(provider)) throw new ProviderError("此服务暂未接入官方余额查询", 400);
  if (!provider.apiKey?.trim()) throw new ProviderError("请先填写 API Key", 400);
  const response = await fetch("https://api.deepseek.com/user/balance", {
    headers: { Authorization: `Bearer ${provider.apiKey.trim()}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new ProviderError(
      response.status === 401
        ? "余额查询鉴权失败，请检查 API Key"
        : `余额查询失败（HTTP ${response.status}），请稍后刷新`,
      response.status,
    );
  const data = await response.json();
  if (typeof data.is_available !== "boolean" || !Array.isArray(data.balance_infos))
    throw new ProviderError("余额接口返回格式不受支持");
  const balances: ProviderBalance["balances"] = data.balance_infos.map((item: Record<string, unknown>) => {
    if (
      !["CNY", "USD"].includes(String(item.currency)) ||
      ![item.total_balance, item.granted_balance, item.topped_up_balance].every(
        (value) => typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value),
      )
    )
      throw new ProviderError("余额接口返回金额格式异常");
    return {
      currency: item.currency as "CNY" | "USD",
      total: String(item.total_balance),
      granted: String(item.granted_balance),
      toppedUp: String(item.topped_up_balance),
    };
  });
  return { isAvailable: data.is_available, balances, fetchedAt: new Date().toISOString() };
}
