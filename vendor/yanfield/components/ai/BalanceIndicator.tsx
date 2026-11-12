"use client";

/**
 * AI 面板底栏的「账户余额」小按钮：
 * - 只对当前生效的 DeepSeek 官方服务显示；离线演示 / 未配置模型时整个组件隐藏；
 * - 点击 POST /api/providers/:id/balance 查询（GET 也由同一路由暴露，这里用 POST 与设置页一致）；
 * - 首次显示「余额」，点击后显示「余额 ¥12.34」；再次点击刷新；
 * - 加载中显示「查询中…」，失败显示「查询失败」并把具体原因放进 title；
 * - 窄栏里用 text-[10.5px] + truncate，避免撑破输入区底栏。
 */

import * as React from "react";
import { Wallet } from "lucide-react";
import { apiPost } from "@/lib/client/api";
import { providerShowsBalance, type ProviderBalance } from "@/lib/ai/balance";
import type { ProviderConfig } from "@/lib/types";
import { cn } from "@/lib/ui/cn";

type BalanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; value: ProviderBalance }
  | { status: "error"; message: string };

function primaryBalance(value: ProviderBalance): ProviderBalance["balances"][number] | null {
  return value.balances.find((item) => item.currency === "CNY") ?? value.balances[0] ?? null;
}

function formatMoney(currency: "CNY" | "USD", amount: string): string {
  const sign = currency === "CNY" ? "¥" : "$";
  const numeric = Number(amount);
  return `${sign}${Number.isFinite(numeric) ? numeric.toFixed(2) : amount}`;
}

function buildTitle(value: ProviderBalance): string {
  const lines = value.balances.map((item) =>
    `${item.currency === "CNY" ? "人民币" : "美元"}：余额 ${item.total}（赠送 ${item.granted} · 充值 ${item.toppedUp}）`,
  );
  return [
    `DeepSeek 账户${value.isAvailable ? "可用" : "不可用（余额不足）"}`,
    ...lines,
    `查询于 ${new Date(value.fetchedAt).toLocaleString()}`,
    "点击刷新余额",
  ].join("\n");
}

/** 官方地址用 API Key 查；harness 通道用 DSH 已登录账号查（见 lib/ai/balance.ts）。 */
function supportsProviderBalance(provider: ProviderConfig): boolean {
  return providerShowsBalance(provider);
}

export interface BalanceIndicatorProps {
  /** 当前对话实际生效的 Provider；非 DeepSeek 官方服务或为空时组件不渲染。 */
  provider: ProviderConfig | null;
  className?: string;
}

export function BalanceIndicator({ provider, className }: BalanceIndicatorProps) {
  const [state, setState] = React.useState<BalanceState>({ status: "idle" });
  const aliveRef = React.useRef(true);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    requestRef.current += 1;
    setState({ status: "idle" });
  }, [provider?.id]);

  const providerId = provider?.id ?? null;
  // 指向兼容中转时隐藏按钮，避免点了才报错。
  const supported = Boolean(provider && supportsProviderBalance(provider));

  const query = React.useCallback(async () => {
    if (!providerId || !supported) return;
    const requestId = ++requestRef.current;
    setState((current) => (current.status === "loading" ? current : { status: "loading" }));
    try {
      const value = await apiPost<ProviderBalance>(
        `/api/providers/${encodeURIComponent(providerId)}/balance`,
      );
      if (aliveRef.current && requestId === requestRef.current) setState({ status: "ready", value });
    } catch (error) {
      if (aliveRef.current && requestId === requestRef.current) {
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "余额查询失败，请稍后重试",
        });
      }
    }
  }, [providerId, supported]);

  if (!provider || !supported) return null;

  const balance = state.status === "ready" ? primaryBalance(state.value) : null;
  const busy = state.status === "loading";
  const label = busy
    ? "查询中…"
    : state.status === "error"
      ? "查询失败"
      : balance
        ? `余额 ${formatMoney(balance.currency, balance.total)}`
        : "余额";
  const title = busy
    ? "正在查询 DeepSeek 账户余额…"
    : state.status === "error"
      ? `${state.message}（点击重试）`
      : state.status === "ready"
        ? buildTitle(state.value)
        : "查询 DeepSeek 账户余额（点击查询）";

  return (
    <button
      type="button"
      data-testid="balance-indicator"
      aria-label={busy ? "正在查询 DeepSeek 账户余额" : "查询 DeepSeek 账户余额"}
      aria-busy={busy}
      title={title}
      onClick={() => void query()}
      className={cn(
        "flex h-6 max-w-[9.5rem] shrink-0 items-center gap-1 whitespace-nowrap rounded px-1 text-[10.5px] tabular-nums transition-colors",
        state.status === "error" ? "text-danger hover:bg-danger/10" : "text-ink-3 hover:bg-surface-2 hover:text-ink",
        busy && "opacity-70",
        className,
      )}
    >
      <Wallet className="size-3 shrink-0" strokeWidth={1.5} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

export default BalanceIndicator;
