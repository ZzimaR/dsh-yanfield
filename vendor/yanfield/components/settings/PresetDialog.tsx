"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { Button, Dialog, Input, Select, Slider, Switch, Textarea } from "@/components/ui/kit";
import { apiPatch, apiPost, notifyDataChanged } from "@/lib/client/api";
import { getYanfieldLocale, translateFor, useT } from "@/lib/i18n";
import { PRESET_EN } from "@/lib/ai/preset-en";
import { AI_FEATURE_LABEL, type AiFeature, type PromptPreset } from "@/lib/types";

export interface PresetDialogProps {
  open: boolean;
  preset: PromptPreset | null;
  onClose: () => void;
  onSaved: (preset: PromptPreset) => void;
}

interface PresetForm {
  name: string;
  feature: AiFeature;
  modelRole: "chat" | "prose";
  temperature: number;
  systemPrompt: string;
  userTemplate: string;
  enabled: boolean;
}

const EMPTY_FORM: PresetForm = {
  name: "",
  feature: "chat",
  modelRole: "chat",
  temperature: 0.8,
  systemPrompt: "",
  userTemplate: "",
  enabled: true,
};

function formFromPreset(preset: PromptPreset | null): PresetForm {
  if (!preset) return EMPTY_FORM;
  const en = getYanfieldLocale() === "en" ? PRESET_EN[preset.name] : undefined;
  return {
    name: preset.isBuiltin ? translateFor(getYanfieldLocale(), preset.name) : preset.name,
    feature: preset.feature,
    modelRole: preset.modelRole,
    temperature: preset.temperature,
    systemPrompt: en?.systemPrompt ?? preset.systemPrompt,
    userTemplate: en?.userTemplate ?? preset.userTemplate,
    enabled: preset.enabled,
  };
}

const FEATURE_OPTIONS = (Object.keys(AI_FEATURE_LABEL) as AiFeature[]).map((feature) => ({
  value: feature,
  label: AI_FEATURE_LABEL[feature],
}));

/** 新建 / 编辑提示词预设（全局，novelId=null）。 */
export function PresetDialog({ open, preset, onClose, onSaved }: PresetDialogProps) {
  const tr = useT();
  const [form, setForm] = React.useState<PresetForm>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setForm(formFromPreset(preset));
    setError(null);
    setSaving(false);
  }, [open, preset]);

  const update = <K extends keyof PresetForm>(key: K, value: PresetForm[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      setError(tr("给预设起个名字吧，例如「更克制的润色」。"));
      return;
    }
    if (!form.systemPrompt.trim() && !form.userTemplate.trim()) {
      setError(tr("至少填写系统提示词或用户模板之一。"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        feature: form.feature,
        modelRole: form.modelRole,
        temperature: form.temperature,
        systemPrompt: form.systemPrompt.trim(),
        userTemplate: form.userTemplate.trim(),
        enabled: form.enabled,
        novelId: preset?.novelId ?? null,
      };
      const saved = preset
        ? await apiPatch<PromptPreset>(`/api/presets/${preset.id}`, payload)
        : await apiPost<PromptPreset>("/api/presets", payload);
      notifyDataChanged("presets");
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr("保存失败，请稍后再试。"));
    } finally {
      setSaving(false);
    }
  };

  const isBuiltin = Boolean(preset?.isBuiltin);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isBuiltin ? tr("内置提示词（只读）") : preset ? tr("编辑提示词预设") : tr("新建提示词预设")}
      description={tr("提示词是白盒的：你可以看到、改掉、恢复默认，AI 的行为由你决定。")}
      width={680}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {tr("关闭")}
          </Button>
          {isBuiltin ? null : (
            <Button variant="primary" icon={<Save className="size-4" />} onClick={submit} loading={saving}>
              {tr("保存预设")}
            </Button>
          )}
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
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input
            label={tr("预设名称")}
            autoFocus
            maxLength={60}
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder={tr("例如：克制版润色")}
            error={error}
            disabled={isBuiltin}
          />
          <Select
            label={tr("适用场景")}
            value={form.feature}
            disabled={isBuiltin}
            onChange={(event) => update("feature", event.target.value as AiFeature)}
            options={FEATURE_OPTIONS.map((option) => ({ ...option, label: tr(option.label) }))}
          />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Select
            label={tr("任务类型")}
            value={form.modelRole}
            disabled={isBuiltin}
            onChange={(event) => update("modelRole", event.target.value === "prose" ? "prose" : "chat")}
            options={[
              { value: "chat", label: tr("通用任务（默认）") },
              { value: "prose", label: tr("长文任务（可选）") },
            ]}
            hint={tr("只作分类。对话和写作都使用同一个默认模型。")}
          />
          <div className="pt-1">
            <Slider
              label={tr("温度")}
              min={0}
              max={2}
              step={0.05}
              value={form.temperature}
              hint={form.temperature.toFixed(2)}
              disabled={isBuiltin}
              onChange={(value) => update("temperature", value)}
            />
          </div>
        </div>
        <Textarea
          label={tr("系统提示词（system）")}
          rows={5}
          value={form.systemPrompt}
          disabled={isBuiltin}
          onChange={(event) => update("systemPrompt", event.target.value)}
          placeholder={tr("定义角色、语气、禁止事项……")}
          hint={tr("支持占位符：{{novelTitle}} {{genre}} {{context}} {{chapter}} {{selection}} {{words}} 等。")}
        />
        <Textarea
          label={tr("用户模板（user）")}
          rows={5}
          value={form.userTemplate}
          disabled={isBuiltin}
          onChange={(event) => update("userTemplate", event.target.value)}
          placeholder={tr("把任务与素材拼成一次请求……")}
          hint={tr("留空则走该场景的默认模板。")}
        />
        <Switch
          checked={form.enabled}
          disabled={isBuiltin}
          onChange={(checked) => update("enabled", checked)}
          label={tr("启用这个预设")}
          hint={tr("停用后会回退到内置预设")}
        />
      </form>
    </Dialog>
  );
}
