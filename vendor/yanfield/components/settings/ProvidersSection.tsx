"use client";

import * as React from "react";
import { ChevronDown, Pencil, Plus, RefreshCw, Server, Trash, TriangleAlert, Zap } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Segmented,
  Skeleton,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui/kit";
import { apiDelete, apiPatch, apiPost, notifyDataChanged, useApi } from "@/lib/client/api";
import type { ProviderPreset } from "@/lib/defaults";
import type { AppSettings, ProviderConfig } from "@/lib/types";
import { providerShowsBalance, type ProviderBalance } from "@/lib/ai/balance";
import { harnessRouteOf, type HarnessRouteOption } from "@/lib/ai/harness-bridge";
import { cn } from "@/lib/ui/cn";
import { ProviderDialog } from "./ProviderDialog";
import { ProviderPresetGrid } from "./ProviderPresetGrid";
import { providerKindLabel } from "./settings-utils";

export interface ProvidersSectionProps {
  settings: AppSettings | undefined;
  update: (patch: Partial<AppSettings>) => void;
}

interface ProviderListResponse {
  items: ProviderConfig[];
}

interface HarnessRoutesResponse {
  routes: HarnessRouteOption[];
  current: string;
  defaultModel: string;
}

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

/** 默认模型下拉的 value 分隔符（Provider id 与 model id 用控制字符拼接）。 */
const MODEL_SEP = "\u001f";

export function ProvidersSection({ settings, update }: ProvidersSectionProps) {
  const providersApi = useApi<ProviderListResponse>("/api/providers");
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProviderConfig | null>(null);
  const [preset, setPreset] = React.useState<ProviderPreset | null>(null);
  const [removing, setRemoving] = React.useState<ProviderConfig | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [testResults, setTestResults] = React.useState<Record<string, TestResult>>({});
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const [balances,setBalances]=React.useState<Record<string,ProviderBalance>>({});
  const [balanceLoading,setBalanceLoading]=React.useState<Record<string,boolean>>({});
  const [balanceErrors,setBalanceErrors]=React.useState<Record<string,string>>({});
  const queryBalance=async(provider:ProviderConfig)=>{
    setBalanceLoading(prev=>({...prev,[provider.id]:true}));setBalanceErrors(prev=>({...prev,[provider.id]:""}));
    try{const value=await apiPost<ProviderBalance>(`/api/providers/${encodeURIComponent(provider.id)}/balance`);setBalances(prev=>({...prev,[provider.id]:value}));}
    catch(error){setBalanceErrors(prev=>({...prev,[provider.id]:error instanceof Error?error.message:"余额查询失败"}));}
    finally{setBalanceLoading(prev=>({...prev,[provider.id]:false}));}
  };
  const items = providersApi.data?.items ?? [];
  const routesApi = useApi<HarnessRoutesResponse>("/api/providers/harness");
  const [switchingRouteId, setSwitchingRouteId] = React.useState<string | null>(null);

  /** 切换 harness 服务的底层路由（账号登录 / 官方 API Key），并把默认模型对齐到新路由的目录。 */
  const switchRoute = async (provider: ProviderConfig, routeId: string) => {
    if (!routeId || routeId === harnessRouteOf(provider.baseUrl)) return;
    setSwitchingRouteId(provider.id);
    try {
      await apiPatch<ProviderConfig>(`/api/providers/${provider.id}`, { baseUrl: `harness:${routeId}` });
      const route = routesApi.data?.routes.find((item) => item.id === routeId);
      const first = route?.models[0];
      const selection = settings?.models.chat;
      const missing = selection?.providerId === provider.id && first
        && !(route?.models ?? []).some((model) => model.id === selection.model);
      if (missing && first && selection) {
        const next = { providerId: provider.id, model: first.id };
        update({ models: { chat: next, prose: next } });
      }
      await providersApi.refresh();
      await routesApi.refresh();
      notifyDataChanged("providers");
      toast({ title: "已切换模型路由", description: route?.name ?? routeId, tone: "success" });
    } catch (cause) {
      toast({ title: "切换失败", description: cause instanceof Error ? cause.message : "请稍后再试", tone: "error" });
    } finally {
      setSwitchingRouteId(null);
    }
  };

  const openCreate = (nextPreset: ProviderPreset | null = null) => {
    setEditing(null);
    setPreset(nextPreset);
    setDialogOpen(true);
  };

  const openEdit = (provider: ProviderConfig) => {
    setPreset(null);
    setEditing(provider);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setPreset(null);
  };

  const toggle = async (provider: ProviderConfig, enabled: boolean) => {
    setTogglingId(provider.id);
    try {
      await apiPatch<ProviderConfig>(`/api/providers/${provider.id}`, { enabled });
      await providersApi.refresh();
      notifyDataChanged("providers");
    } catch (cause) {
      toast({
        title: "切换失败",
        description: cause instanceof Error ? cause.message : "请稍后再试",
        tone: "error",
      });
    } finally {
      setTogglingId(null);
    }
  };

  const test = async (provider: ProviderConfig) => {
    setTestingId(provider.id);
    try {
      const result = await apiPost<TestResult>(`/api/providers/${provider.id}/test`, {});
      setTestResults((previous) => ({ ...previous, [provider.id]: result }));
      toast({
        title: result.ok ? "连接正常" : "连接失败",
        description: `${result.message}${typeof result.latencyMs === "number" ? ` · ${result.latencyMs}ms` : ""}`,
        tone: result.ok ? "success" : "error",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "测试请求失败";
      setTestResults((previous) => ({ ...previous, [provider.id]: { ok: false, message } }));
      toast({ title: "连接失败", description: message, tone: "error" });
    } finally {
      setTestingId(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/providers/${removing.id}`);
      await providersApi.refresh();
      notifyDataChanged("providers");
      toast({ title: "已删除", description: `「${removing.name}」已移除`, tone: "success" });
      setRemoving(null);
    } catch (cause) {
      toast({
        title: "删除失败",
        description: cause instanceof Error ? cause.message : "请稍后再试",
        tone: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const onSaved = async (provider: ProviderConfig) => {
    setDialogOpen(false);
    setPreset(null);
    await providersApi.refresh();
    toast({ title: editing ? "已更新" : "已添加", description: provider.name, tone: "success" });
    // 首次添加服务时顺手设为默认模型
    if (settings && !editing && provider.enabled && !settings.models.chat.providerId && provider.models[0]) {
      const next = { providerId: provider.id, model: provider.models[0].id };
      update({ models: { chat: next, prose: next } });
    }
  };

  const activeProviders = items.filter((provider) => provider.enabled && provider.models.length > 0);
  const defaultSelection = settings?.models.chat;
  const currentDefault =
    defaultSelection?.providerId && defaultSelection.model
      ? `${defaultSelection.providerId}${MODEL_SEP}${defaultSelection.model}`
      : "";
  const modelProviders = items.filter(
    (provider) => provider.models.length > 0 && (provider.enabled || provider.id === defaultSelection?.providerId),
  );
  const currentProvider = items.find((provider) => provider.id === defaultSelection?.providerId);
  const currentModel = currentProvider?.models.find((model) => model.id === defaultSelection?.model);
  const currentContextWindow = currentModel?.contextWindow;

  const changeDefaultModel = (value: string) => {
    if (!settings) return;
    if (!value) {
      const cleared = { providerId: null, model: "" };
      update({ models: { chat: cleared, prose: cleared } });
      return;
    }
    const splitAt = value.indexOf(MODEL_SEP);
    if (splitAt < 0) return;
    const next = { providerId: value.slice(0, splitAt), model: value.slice(splitAt + 1) };
    update({ models: { chat: next, prose: next } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif text-lg text-ink">模型服务</h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-6 text-ink-3">
            本构建只接 DeepSeek：可以填官方 API Key，也可以直接用 DSH 里已登录的账号。配置只保存在本机，写作与对话共用一个默认模型，可随时切换。
          </p>
        </div>
        <Button variant="primary" size="sm" className="shrink-0" icon={<Plus className="size-3.5" />} onClick={() => openCreate()}>
          添加 DeepSeek
        </Button>
      </div>

      <ProviderPresetGrid existingNames={items.map((item) => item.name)} onPick={(next) => openCreate(next)} />

      {providersApi.loading && items.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : providersApi.error ? (
        <Card className="flex items-center justify-between gap-3 border-danger/30 bg-danger/5 p-3.5">
          <p className="text-[12px] text-danger">模型服务加载失败：{providersApi.error}</p>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void providersApi.refresh()}>
            重试
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Server className="size-5" />}
          title="还没有接入模型服务"
          description="先用内置的离线演示模式跑通流程，之后随时填入 DeepSeek 官方 API Key。"
          action={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => openCreate()}>
              添加 DeepSeek
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((provider) => {
            const result = testResults[provider.id];
            return (
              <Card key={provider.id} className={cn("p-3.5", !provider.enabled && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-3">
                    <Server className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-ink">{provider.name}</span>
                      {provider.name !== (provider.kind === "demo" ? "离线演示模式" : providerKindLabel(provider.kind)) ? (
                        <Badge tone="default">{provider.kind === "demo" ? "离线演示模式" : providerKindLabel(provider.kind)}</Badge>
                      ) : null}
                      <Badge tone="jade">{provider.models.length} 个模型</Badge>
                      {result ? (
                        <Badge tone={result.ok ? "success" : "danger"}>
                          {result.ok ? "连接正常" : "连接失败"}
                        </Badge>
                      ) : null}
                    </div>
                    {provider.kind === "harness" ? (() => {
                      const currentRoute = harnessRouteOf(provider.baseUrl) ?? "";
                      const routes = routesApi.data?.routes ?? [];
                      const active = routes.find((route) => route.id === currentRoute);
                      const options = routes.map((route) => ({
                        value: route.id,
                        label: (
                          <span className="flex items-center gap-1.5">
                            {route.name}
                            {route.available ? null : <span className="text-ink-4">· 未就绪</span>}
                          </span>
                        ),
                      }));
                      return (
                        <div className="mt-2 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-ink-3">模型路由</span>
                            {options.length > 0 ? (
                              <Segmented
                                size="sm"
                                value={currentRoute}
                                options={options}
                                onChange={(value) => { if (!switchingRouteId) void switchRoute(provider, value); }}
                              />
                            ) : (
                              <span className="font-mono text-[10.5px] text-ink-4">{provider.baseUrl}</span>
                            )}
                          </div>
                          <p className={cn("text-[11px]", active && !active.available ? "text-warning" : "text-ink-3")}>
                            {active
                              ? active.available
                                ? `${active.models.length} 个模型 · ${routeKindHint(active.id)}`
                                : active.unavailableReason ?? "这条路由暂时不可用"
                              : "正在读取宿主路由…"}
                          </p>
                        </div>
                      );
                    })() : (
                      <p className="mt-1 truncate font-mono text-[10.5px] text-ink-3">
                        {provider.baseUrl || "本地演示 · 无需网络"}
                      </p>
                    )}
                    {provider.models.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {provider.models.slice(0, 5).map((model) => (
                          <span key={model.id} className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">
                            {model.label}
                          </span>
                        ))}
                        {provider.models.length > 5 ? (
                          <span className="px-1 py-0.5 text-[10px] text-ink-3">+{provider.models.length - 5}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {(()=>{const supported=providerShowsBalance(provider);
                      const value=balances[provider.id];return supported?<div className="mt-2.5 space-y-1.5 text-[11px]">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                          <Button size="sm" variant="secondary" loading={balanceLoading[provider.id]} onClick={()=>void queryBalance(provider)}>{value?"刷新余额":"查询余额"}</Button>
                          {value?<span className="text-ink-2">
                            {value.isAvailable?"账户可用":"余额不足"} · {value.balances.map(b=>`${b.currency} ${b.total}`).join(" / ")}
                          </span>:<span className="text-ink-3">读取 DSH 里已登录的 DeepSeek 账号</span>}
                        </div>
                        {value?<>
                          <p className="text-ink-3">{value.balances.map(b=>`${b.currency} 充值 ${b.toppedUp} · 赠送 ${b.granted}`).join("；")}</p>
                          <p className="text-ink-4">查询于 {new Date(value.fetchedAt).toLocaleString()} · 账户余额，不是本次调用费用{balanceErrors[provider.id]?"（刷新失败，显示上次结果）":""}</p>
                        </>:null}
                        {balanceErrors[provider.id]?<p role="alert" className="text-danger">{balanceErrors[provider.id]}</p>:null}
                      </div>:null;})()}
                    {result && !result.ok ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[10.5px] text-danger">
                        <TriangleAlert className="size-3" aria-hidden />
                        {result.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Switch
                      checked={provider.enabled}
                      disabled={togglingId === provider.id}
                      onChange={(checked) => void toggle(provider, checked)}
                    />
                    {provider.kind !== "demo" ? (
                      <>
                        <IconButton
                          label="测试连通性"
                          size="sm"
                          disabled={testingId === provider.id}
                          onClick={() => void test(provider)}
                        >
                          {testingId === provider.id ? <Spinner size="sm" /> : <Zap className="size-3.5" />}
                        </IconButton>
                        <IconButton label="编辑" size="sm" onClick={() => openEdit(provider)}>
                          <Pencil className="size-3.5" />
                        </IconButton>
                      </>
                    ) : null}
                    <IconButton label="删除" size="sm" onClick={() => setRemoving(provider)}>
                      <Trash className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-4">
        <h3 className="text-[13px] font-medium text-ink">默认模型</h3>
        <p className="mt-1 text-[11.5px] leading-5 text-ink-3">AI 对话与写作任务都使用这个模型；可随时切换。</p>
        {activeProviders.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line bg-surface-2/50 px-3 py-2.5 text-[11.5px] leading-5 text-ink-3">
            还没有可用的模型：先在上方添加并启用一个 DeepSeek 服务，并至少保留一个模型。
          </p>
        ) : (
          <>
            <div className="relative mt-3">
              <select
                aria-label="默认模型"
                value={currentDefault}
                onChange={(event) => changeDefaultModel(event.target.value)}
                className="h-9 w-full cursor-pointer appearance-none rounded-md border border-line bg-surface px-3 pr-8 text-sm text-ink outline-none transition-colors duration-200 focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
              >
                <option value="">未选择</option>
                {modelProviders.map((provider) => (
                  <optgroup key={provider.id} label={provider.name}>
                    {provider.models.map((model) => (
                      <option key={model.id} value={`${provider.id}${MODEL_SEP}${model.id}`}>
                        {model.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3"
                aria-hidden
              />
            </div>
            <p className="mt-1.5 text-[10.5px] leading-5 text-ink-3">
              {currentProvider && currentModel
                ? `当前：${currentProvider.name} · ${currentModel.label}${
                    typeof currentContextWindow === "number" && currentContextWindow > 0
                      ? ` · 上下文约 ${Math.round(currentContextWindow / 1000)}K tokens`
                      : ""
                  }`
                : "选择一个模型后，AI 面板与所有写作任务都会使用它。"}
            </p>
          </>
        )}
      </Card>

      <ProviderDialog
        open={dialogOpen}
        provider={editing}
        preset={preset}
        onClose={closeDialog}
        onSaved={(provider) => void onSaved(provider)}
      />

      <ConfirmDialog
        open={removing !== null}
        title={`删除模型服务「${removing?.name ?? ""}」`}
        description="删除后，绑定到它的默认模型会失效，但不会影响已写好的章节。"
        confirmText="删除服务"
        danger
        loading={deleting}
        onConfirm={() => void remove()}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}

/** 路由名后面的一句用途提示，避免只有名字看不出区别。 */
function routeKindHint(routeId: string): string {
  if (routeId === "deepseek-account") return "用 DSH 里已登录的账号，不需要填 Key";
  if (routeId === "deepseek-official") return "用 DeepSeek 官方 API Key，按调用计费";
  return "宿主里的模型路由";
}
