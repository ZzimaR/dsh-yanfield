"use client";

import * as React from "react";
import { ArrowUpRight, Save } from "lucide-react";
import { Button, Dialog, Input, Switch } from "@/components/ui/kit";
import { apiPatch, apiPost, notifyDataChanged } from "@/lib/client/api";
import { useT } from "@/lib/i18n";
import type { ProviderPreset } from "@/lib/defaults";
import type { ModelOption, ProviderConfig, ProviderKind } from "@/lib/types";
import { ProviderModelsField } from "./ProviderModelsField";
import { PROVIDER_KINDS } from "./settings-utils";

export interface ProviderDialogProps {
  open: boolean;
  provider: ProviderConfig | null;
  /** 从「快速添加」选中的品牌预设；只预填名称与 Base URL。 */
  preset?: ProviderPreset | null;
  onClose: () => void;
  onSaved: (provider: ProviderConfig) => void;
}

interface ProviderForm {
  kind: ProviderKind;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelOption[];
  enabled: boolean;
}

/** 本构建只接 DeepSeek 官方接口；离线演示服务不进入这个弹窗。 */
const DEEPSEEK_KIND: ProviderKind = "deepseek";
const DEEPSEEK_BASE_URL = PROVIDER_KINDS.find((item) => item.value === "deepseek")?.defaultBaseUrl ?? "https://api.deepseek.com";

const EMPTY_FORM: ProviderForm = {
  kind: DEEPSEEK_KIND,
  name: "",
  baseUrl: DEEPSEEK_BASE_URL,
  apiKey: "",
  models: [],
  enabled: true,
};

function formFromProvider(provider: ProviderConfig | null): ProviderForm {
  if (!provider) return EMPTY_FORM;
  return {
    // 离线演示服务不出现在编辑入口；防御性地把非演示服务也当 DeepSeek 处理。
    kind: provider.kind === "demo" ? DEEPSEEK_KIND : provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: "",
    models: provider.models,
    enabled: provider.enabled,
  };
}

function formFromPreset(preset: ProviderPreset): ProviderForm {
  return {
    kind: DEEPSEEK_KIND,
    name: preset.name,
    baseUrl: preset.baseUrl || DEEPSEEK_BASE_URL,
    apiKey: "",
    models: preset.models,
    enabled: true,
  };
}

/** 新增 / 编辑模型服务。apiKey 留空表示不修改已保存的密钥。 */
export function ProviderDialog({ open, provider, preset, onClose, onSaved }: ProviderDialogProps) {
  const tr = useT();
  const [form, setForm] = React.useState<ProviderForm>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(provider ? formFromProvider(provider) : preset ? formFromPreset(preset) : formFromProvider(null));
    setError(null);
    setSaving(false);
  }, [open, provider, preset]);

  const update = <K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const changeModels = (models: ModelOption[]) => {
    setForm((current) => ({ ...current, models }));
  };

  const submit = async () => {
    const name = form.name.trim();
    const isHarness = form.kind === "harness";
    if (!name) {
      setError(tr("给这个服务起个名字吧，例如「DeepSeek」。"));
      return;
    }
    if (!isHarness && !form.baseUrl.trim()) {
      setError(tr("请填写 Base URL（DeepSeek 官方地址为 https://api.deepseek.com）。"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        kind: isHarness ? form.kind : DEEPSEEK_KIND,
        name,
        baseUrl: isHarness ? (form.baseUrl.trim() || "harness:deepseek") : form.baseUrl.trim(),
        models: form.models,
        enabled: form.enabled,
      };
      const apiKey = form.apiKey.trim();
      const saved = provider
        ? await apiPatch<ProviderConfig>(`/api/providers/${provider.id}`, apiKey ? { ...payload, apiKey } : payload)
        : await apiPost<ProviderConfig>("/api/providers", { ...payload, apiKey });
      notifyDataChanged("providers");
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("保存失败，请稍后再试。"));
    } finally {
      setSaving(false);
    }
  };

  const apiKeyHint = provider
    ? tr("当前密钥：{key}；留空表示不修改。", { key: provider.apiKey || tr("未设置") })
    : tr("密钥只写入本机 SQLite，不会上传到任何服务器。");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={provider ? tr("编辑模型服务") : tr("添加模型服务")}
      description={form.kind === "harness"
        ? tr("这一项走 DeepSeek Harness 里已经配置好的模型，不需要再填 API Key。")
        : tr("本构建专精 DeepSeek：填写官方 API Key，即可对话、写作，并查询账户余额。")}
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {tr("取消")}
          </Button>
          <Button variant="primary" icon={<Save className="size-4" />} onClick={submit} loading={saving}>
            {tr("保存")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {preset && !provider ? (
          <div className="rounded-md border border-line bg-surface-2/70 px-3 py-2.5">
            <p className="text-[11.5px] leading-5 text-ink-3">{preset.description}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] leading-4">
              {preset.keyUrl ? (
                <a
                  href={preset.keyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  {tr("去 DeepSeek 控制台申请 API Key")}
                  <ArrowUpRight className="size-3" aria-hidden />
                </a>
              ) : null}
              {preset.note ? <span className="text-ink-3">{preset.note}</span> : null}
            </div>
          </div>
        ) : form.kind === "harness" ? (
          <p className="rounded-md border border-line bg-surface-2/70 px-3 py-2.5 text-[11.5px] leading-5 text-ink-3">
            {tr("模型由 DeepSeek Harness 提供。写作、审阅和资料整理都走当前 profile 里的模型，书稿仍保存在本机。")}
          </p>
        ) : (
          <p className="rounded-md border border-line bg-surface-2/70 px-3 py-2.5 text-[11.5px] leading-5 text-ink-3">
            {tr("接入类型固定为")}{" "}
            <span className="font-medium text-ink-2">{tr("DeepSeek 官方接口")}</span>
            {tr("；其他服务商适配已移除。")}
          </p>
        )}
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input
            label={tr("名称")}
            autoFocus
            maxLength={40}
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder={tr("例如：DeepSeek")}
            error={error}
          />
          {form.kind === "harness" ? null : (
          <Input
            label={tr("Base URL")}
            value={form.baseUrl}
            onChange={(event) => update("baseUrl", event.target.value)}
            placeholder={DEEPSEEK_BASE_URL}
            hint={tr("使用官方地址 https://api.deepseek.com 才能查询账户余额。")}
          />
          )}
        </div>
        {form.kind === "harness" ? null : (
        <Input
          label={provider ? tr("API Key（可选）") : tr("API Key")}
          type="password"
          autoComplete="off"
          value={form.apiKey}
          onChange={(event) => update("apiKey", event.target.value)}
          placeholder={provider ? tr("留空表示不修改") : "sk-…"}
          hint={apiKeyHint}
        />
        )}
        <ProviderModelsField
          models={form.models}
          onChange={changeModels}
          kind={form.kind}
          baseUrl={form.baseUrl}
          apiKey={form.apiKey}
          providerId={provider?.id ?? null}
        />
        <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2.5">
          <Switch
            checked={form.enabled}
            onChange={(checked) => update("enabled", checked)}
            label={tr("启用这个服务")}
            hint={tr("停用后不会出现在默认模型选择里")}
          />
        </div>
      </form>
    </Dialog>
  );
}
