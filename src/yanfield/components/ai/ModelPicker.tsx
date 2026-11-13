"use client";

/**
 * 默认模型选择器（输入区底部 / AiPanel 头部共用）：
 * - 用户不再区分「对话 / 正文」模型，选中后 settings.models.chat 与 prose 写同一个值；
 * - 触发器展示当前生效模型（离线演示 / Provider / 未配置），点开弹出选择菜单；
 * - 弹层按 Provider 分组列出已启用模型，打开时重新拉取 /api/providers 避免列表过期；
 * - 当前模型已不在 Provider 列表时显示灰色「未找到（去设置检查）」，不静默吞掉；
 * - 底部固定「管理模型服务 / 拉取模型列表」，派发 yanfield:open-settings 打开设置悬浮窗。
 *
 * 用自建 portal 弹层（而非 kit Dropdown）：需要分组标题、当前选中态与底部固定入口。
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { yanfieldPortal } from "@/lib/ui/portal";
import {
  Check,
  ChevronDown,
  CircleAlert,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { THINKING_OPTIONS, thinkingProfile, modelThinking, supportsThinking, thinkingKey, type ThinkingLevel } from "@/lib/ai/thinking";
import { Spinner, useToast } from "@/components/ui/kit";
import { apiGet, apiPatch, notifyDataChanged } from "@/lib/client/api";
import type { AppSettings, ModelOption, ProviderConfig } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { formatTokens } from "./utils";
import type { ModelTargetInfo } from "./model-info";
import { humanizeAiError } from "./errors";
import { isInsideComposedPath } from "@/lib/ui/composed";
import { useT } from "@/lib/i18n";

const MENU_WIDTH = 320;
const OPEN_SETTINGS_EVENT = "yanfield:open-settings";

const KIND_LABEL: Record<ProviderConfig["kind"], string> = {
  deepseek: "DeepSeek",
  demo: "离线演示",
};

export interface ModelPickerProps {
  settings: AppSettings | null;
  providers: ProviderConfig[] | undefined;
  /** 当前实际生效的模型（用于展示与选中态） */
  target: ModelTargetInfo | null;
  /** PATCH 成功后把最新设置回传给面板，触发顶栏 / 其它区域刷新 */
  onChanged: (settings: AppSettings) => void;
  /** footer：输入区底部样式；header：面板标题栏徽标样式 */
  variant?: "footer" | "header";
  disabled?: boolean;
  className?: string;
}

export function ModelPicker({
  settings,
  providers,
  target,
  onChanged,
  variant = "footer",
  disabled = false,
  className,
}: ModelPickerProps) {
  const isHeader = variant === "header";
  const { toast } = useToast();
  const tr = useT();
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** 弹层打开时实时拉取的 Provider 列表（避免父级缓存过期） */
  const [liveProviders, setLiveProviders] = React.useState<ProviderConfig[] | null>(null);
  const [fetched, setFetched] = React.useState(false);
  const anchorRef = React.useRef<HTMLSpanElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const groups = React.useMemo(
    () => (liveProviders ?? providers ?? []).filter((provider) => provider.enabled),
    [liveProviders, providers],
  );
  const realProviders = React.useMemo(
    () => groups.filter((provider) => provider.kind !== "demo"),
    [groups],
  );
  const currentProviderId = settings?.models.chat.providerId ?? null;
  const currentModel = settings?.models.chat.model ?? target?.model ?? "";
  const currentProseProviderId = settings?.models.prose.providerId ?? null;
  const currentProseModel = settings?.models.prose.model ?? "";

  // 面板只有 384px 宽，底部这一行放不下「DeepSeek Harness / deepseek-flash」，
  // 之前会被截成「DeepSeek …」。这里压成「DeepSeek · flash」，完整信息放 title 里。
  const shortModel = (value: string) => value.replace(/^deepseek[-_\s]*/i, "");
  const fullLabel = !target || !target.ready
    ? tr("未配置模型")
    : target.providerKind === "demo"
      ? tr("离线演示模式 · {model}", { model: target.model })
      : `${target.providerName} / ${target.model}`;
  const label = !target || !target.ready
    ? tr("未配置模型")
    : target.providerKind === "demo"
      ? tr("离线演示 · {model}", { model: target.model })
      : tr("DeepSeek · {model}", { model: shortModel(target.model) });

  /** 当前模型是否仍存在于已启用 Provider 列表中 */
  const currentInList = React.useMemo(() => {
    if (!currentProviderId || !currentModel) return false;
    const provider = groups.find((item) => item.id === currentProviderId);
    return Boolean(provider && provider.models.some((model) => model.id === currentModel));
  }, [groups, currentProviderId, currentModel]);
  const staleCurrent = fetched && Boolean(currentProviderId) && Boolean(currentModel) && !currentInList;
  const staleText = `${target?.providerName ?? currentProviderId ?? tr("未知 Provider")} / ${currentModel}`;

  const openSettings = React.useCallback((section = "providers") => {
    setOpen(false);
    if (typeof window !== "undefined") {
      // shell 的 SettingsDialog Host 监听该事件，打开模型服务分区
      window.dispatchEvent(
        new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { section } }),
      );
    }
  }, []);

  /* 每次打开都重新拉取 Provider 列表，避免设置里刚拉取 / 删除的模型未同步 */
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setFetched(false);
    setError(null);
    apiGet<{ items: ProviderConfig[] }>("/api/providers")
      .then((data) => {
        if (!alive) return;
        setLiveProviders(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        /* 拉取失败时退回父级传入的列表，不打断选择 */
      })
      .finally(() => {
        if (alive) setFetched(true);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  /* 弹层定位：下方空间足够优先向下，否则向上；跟随滚动 / 缩放重算 */
  React.useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.min(Math.max(8, rect.left), Math.max(8, vw - MENU_WIDTH - 8));
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      const below = spaceBelow >= menuHeight + 16 || spaceBelow >= spaceAbove;
      let top = below ? rect.bottom + 8 : rect.top - menuHeight - 8;
      top = Math.min(Math.max(8, top), Math.max(8, vh - menuHeight - 8));
      setPos({ top, left });
    };
    place();
    const frame = window.requestAnimationFrame(place);
    const onPointerDown = (event: PointerEvent) => {
      // shadow DOM 下 event.target 会被重定向到 host，必须用 composedPath 判断
      if (isInsideComposedPath(event, [menuRef.current, anchorRef.current])) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const thinkingProvider=groups.find(p=>p.id===target?.providerId);
  const profile=thinkingProvider?thinkingProfile(thinkingProvider,target?.model||""):undefined;
  const thinkingSupported=!!thinkingProvider&&supportsThinking(thinkingProvider,target?.model||"");
  const thinking=thinkingProvider&&settings?modelThinking(settings,thinkingProvider,target?.model||""):undefined;
  const chooseThinking=async(value:ThinkingLevel)=>{
    if(busy||!target)return;
    setBusy("thinking");setError(null);
    try{
      const updated=await apiPatch<AppSettings>("/api/settings",{modelThinking:{[thinkingKey(target.providerId,target.model)]:value}});
      onChanged(updated);notifyDataChanged("settings");
    }catch(cause){setError(cause instanceof Error?cause.message:tr("设置失败"));}finally{setBusy(null);}
  };

  const choose = React.useCallback(
    async (provider: ProviderConfig, model: ModelOption) => {
      if (busy) return;
      // 对话 / 正文两侧都已指向该模型时无需重复写入
      if (
        currentProviderId === provider.id &&
        currentModel === model.id &&
        currentProseProviderId === provider.id &&
        currentProseModel === model.id
      ) {
        setOpen(false);
        return;
      }
      setBusy(`${provider.id}:${model.id}`);
      setError(null);
      try {
        // 用户只选一个「默认模型」：chat / prose 写同值
        const updated = await apiPatch<AppSettings>("/api/settings", {
          models: {
            chat: { providerId: provider.id, model: model.id },
            prose: { providerId: provider.id, model: model.id },
          },
        });
        onChanged(updated);
        notifyDataChanged("settings");
        toast({
          title: tr("默认模型已切换"),
          description: `${tr(provider.name)} / ${tr(model.label) || model.id}`,
          tone: "success",
        });
        setOpen(false);
      } catch (cause) {
        const info = humanizeAiError(cause);
        setError(info.hint ? tr("{title}：{hint}", { title: info.title, hint: info.hint }) : info.title);
      } finally {
        setBusy(null);
      }
    },
    [
      busy,
      currentModel,
      currentProviderId,
      currentProseModel,
      currentProseProviderId,
      onChanged,
      toast,
      tr,
    ],
  );

  return (
    <span ref={anchorRef} className="inline-flex min-w-0 max-w-full">
      <button
        type="button"
        aria-label={tr("选择默认模型")}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={
          target?.ready
            ? tr("默认模型：{label}{context}（点击切换）", {
                label,
                context: target.contextWindow
                  ? tr(" · 上下文 {size}", { size: formatTokens(target.contextWindow) })
                  : "",
              })
            : tr("还没有可用的模型，点击选择或去设置")
        }
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOpen((value) => !value);
        }}
        className={cn(
          "inline-flex min-w-0 items-center gap-1 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
          isHeader
            ? "max-w-[140px] shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10.5px] text-ink-3 hover:border-accent/40 hover:text-ink-2 dark:text-ink-3"
            : "max-w-full rounded-sm px-1.5 py-1 text-[11px] text-ink-3 hover:bg-surface-2 hover:text-ink-2 dark:text-ink-3",
          className,
        )}
      >
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            target?.ready ? "bg-success" : "bg-gold",
          )}
          aria-hidden
        />
        <span className="truncate" title={fullLabel}>{label}</span>
        {thinkingSupported?<span className="shrink-0 text-[9px] text-ink-4">{tr("思考·{level}", { level: tr(THINKING_OPTIONS.find(o=>o.value===(thinking||"default"))?.label ?? "") })}</span>:null}
        <ChevronDown className="size-2.5 shrink-0 opacity-70" />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="dialog"
              aria-label={tr("选择默认模型")}
              className="fixed z-[90] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-md border border-line bg-surface text-ink shadow-float rise-in"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH }}
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-line px-3 py-2">
                <span className="text-[12.5px] font-medium text-ink">{tr("选择默认模型")}</span>
                <span className="text-[10.5px] text-ink-4">
                  {realProviders.length > 0 ? tr("{count} 个 DeepSeek 服务", { count: realProviders.length }) : tr("仅离线演示")}
                </span>
              </div>

              {!thinkingSupported && thinkingProvider?<p className="border-b border-line px-3 py-2 text-[10px] leading-relaxed text-ink-4">{profile?.capability?.supported===false?tr("接口声明此模型不支持思考。"):profile?.capability?.supported?tr("模型支持思考，但接口未声明可用档位或当前参数协议尚未适配，使用服务商默认。"):tr("思考能力未知；可在模型设置中重新拉取。未确认能力时使用服务商默认。")}</p>:null}
              {thinkingSupported?<div className="border-b border-line px-3 py-3">
                <div className="mb-2 flex items-center justify-between text-[11px]"><span className="text-ink-3">{tr("当前模型 · 思考程度")}</span><span className="text-ink-4">{tr("按模型记忆")}</span></div>
                <div className="grid grid-cols-3 gap-1" role="group" aria-label={tr("思考程度")}>{profile?.options.map(option=><button key={option.value} type="button" aria-pressed={(thinking||"default")===option.value} disabled={busy!==null} onClick={()=>void chooseThinking(option.value)} className={cn("flex-1 rounded-md px-2 py-1.5 text-[11px]",(thinking||"default")===option.value?"bg-accent/10 text-accent":"bg-surface-2 text-ink-3 hover:text-ink")}>{tr(option.label)}</button>)}</div>
                <p className="mt-2 text-[10px] leading-relaxed text-ink-4">{tr("仅显示当前接口已适配的档位。默认不额外指定参数；提高强度可能增加等待与 token 消耗。")}</p>
              </div>:null}
              <div className="scroll-thin max-h-[min(380px,55vh)] overflow-y-auto p-1.5">
                {realProviders.length === 0 ? (
                  <div className="mx-1 mb-1.5 rounded-sm border border-gold/25 bg-gold-soft/70 px-2.5 py-2 text-[11px] leading-relaxed text-ink-2 dark:bg-gold-soft/30">
                    <p className="font-medium text-ink">{tr("正在使用离线演示模式（无需 Key）")}</p>
                    <p className="mt-0.5 text-ink-3">
                      {tr("演示模式不会调用外部服务，适合先体验流程；填入 DeepSeek API Key 即可接入真实模型。")}
                    </p>
                  </div>
                ) : null}

                {staleCurrent ? (
                  <div className="mx-1 mb-1.5 rounded-sm border border-line bg-surface-2 px-2.5 py-2 text-[11px] leading-relaxed text-ink-3">
                    <p className="flex items-center gap-1 font-medium text-ink-2">
                      <CircleAlert className="size-3 shrink-0" />
                      {tr("当前默认模型 未找到（去设置检查）")}
                    </p>
                    <p className="mt-0.5 break-all text-ink-4">
                      {tr("{model} 可能已被删除、停用或改名。", { model: staleText })}
                    </p>
                    <button
                      type="button"
                      onClick={() => openSettings()}
                      className="mt-1 text-[11px] text-accent underline underline-offset-2 transition-opacity duration-150 hover:opacity-80"
                    >
                      {tr("打开模型服务设置")}
                    </button>
                  </div>
                ) : null}

                {error ? (
                  <div className="mx-1 mb-1.5 rounded-sm border border-danger/25 bg-danger/10 px-2.5 py-2 text-[11px] leading-relaxed text-danger">
                    {error}
                  </div>
                ) : null}

                {groups.length === 0 ? (
                  <p className="px-2.5 py-4 text-center text-[11.5px] text-ink-4">
                     {tr("还没有已启用的 Provider，去设置里添加一个吧。")}
                  </p>
                ) : null}

                {groups.map((provider) => {
                  const selectedProvider = currentProviderId === provider.id;
                  return (
                    <div key={provider.id} className="mb-1 last:mb-0">
                      <div className="flex items-center gap-1.5 px-2 py-1">
                        <span className="truncate text-[10.5px] font-medium uppercase tracking-wide text-ink-4">
                          {tr(provider.name)}
                        </span>
                        <span className="shrink-0 rounded-full border border-line px-1.5 text-[9.5px] text-ink-4">
                          {tr(KIND_LABEL[provider.kind])}
                        </span>
                        {provider.kind === "demo" ? (
                          <span className="shrink-0 text-[9.5px] text-ink-4">{tr("无需 Key")}</span>
                        ) : null}
                      </div>
                      {provider.models.length === 0 ? (
                        <p className="px-2 pb-1 text-[10.5px] text-ink-4">{tr("该 Provider 还没有配置模型。")}</p>
                      ) : (
                        provider.models.map((model) => {
                          const selected = selectedProvider && currentModel === model.id;
                          const key = `${provider.id}:${model.id}`;
                          return (
                            <button
                              key={key}
                              type="button"
                              role="menuitemradio"
                              aria-checked={selected}
                              disabled={busy !== null}
                              onClick={() => void choose(provider, model)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 disabled:cursor-not-allowed",
                                selected
                                  ? "bg-accent-soft text-accent"
                                  : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                              )}
                            >
                              <span className="flex size-4 shrink-0 items-center justify-center">
                                {selected ? <Check className="size-3.5" /> : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px]">
                                  {tr(model.label) || model.id}
                                </span>
                                <span className="block truncate text-[10.5px] text-ink-4">
                                  {model.id}
                                  {typeof model.contextWindow === "number" &&
                                  model.contextWindow > 0
                                    ? tr(" · 上下文 {size}", { size: formatTokens(model.contextWindow) })
                                    : ""}
                                </span>
                              </span>
                              {busy === key ? <Spinner size="sm" /> : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-line p-1.5">
                <button
                  type="button"
                  onClick={() => openSettings()}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                >
                  <Settings2 className="size-3.5 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block">{tr("管理模型服务")}</span>
                    <span className="block text-[10.5px] text-ink-4">
                      {tr("添加 / 启用 DeepSeek 服务，配置默认模型")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openSettings()}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12px] text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
                >
                  <RefreshCw className="size-3.5 shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block">{tr("拉取模型列表")}</span>
                    <span className="block text-[10.5px] text-ink-4">
                      {tr("打开「设置 → 模型服务」，重新拉取或手动添加模型")}
                    </span>
                  </span>
                </button>
              </div>
            </div>,
            yanfieldPortal(),
          )
        : null}
    </span>
  );
}

export default ModelPicker;
