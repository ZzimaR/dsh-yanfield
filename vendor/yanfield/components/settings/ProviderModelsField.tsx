"use client";

/**
 * ProviderDialog 的「模型列表」字段：
 * - 从服务商拉取真实模型列表（POST /api/providers/models，未保存的服务也能预览）
 * - 手动添加 / 删除模型行
 * - 不灌入预设模型；显式拉取以服务商本次返回为准
 */

import * as React from "react";
import { Download, Plus, Trash, X } from "lucide-react";
import { Badge, Button, IconButton, Input, Spinner, useToast } from "@/components/ui/kit";
import { apiPost } from "@/lib/client/api";
import type { ModelOption, ProviderKind } from "@/lib/types";
import { cn } from "@/lib/ui/cn";

export interface ProviderModelsFieldProps {
  models: ModelOption[];
  onChange: (models: ModelOption[]) => void;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  /** 已保存的 Provider id；编辑时用来复用库里的 API Key。 */
  providerId: string | null;
}

interface FetchModelsResponse {
  models: ModelOption[];
  endpoint: string;
  count: number;
}

export function ProviderModelsField({
  models,
  onChange,
  kind,
  baseUrl,
  apiKey,
  providerId,
}: ProviderModelsFieldProps) {
  const { toast } = useToast();
  const [fetching, setFetching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  const needsKey = kind !== "demo" && kind !== "harness";
  const canFetch = !needsKey || apiKey.trim().length > 0 || providerId !== null;

  const fetchModels = async () => {
    setFetching(true);
    setError(null);
    try {
      const result = await apiPost<FetchModelsResponse>("/api/providers/models", {
        providerId: providerId ?? undefined,
        kind,
        baseUrl: baseUrl.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });
      // Explicit refresh replaces the account catalog; old preset entries must not linger.
      const seen = new Set<string>();
      const merged = result.models.filter((model) => {
        if (!model.id || seen.has(model.id)) return false;
        seen.add(model.id);
        return true;
      });
      onChange(merged);
      toast({
        title: "已拉取模型列表",
        description: `从 ${result.endpoint || "服务端"} 拉取到 ${result.count} 个模型`,
        tone: "success",
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "拉取模型列表失败";
      setError(message);
      toast({ title: "拉取失败", description: message, tone: "error" });
    } finally {
      setFetching(false);
    }
  };

  const addManual = () => {
    const id = draft.trim();
    if (!id) return;
    if (models.some((model) => model.id === id)) {
      toast({ title: "这个模型已在列表里", description: id, tone: "error" });
      setDraft("");
      return;
    }
    onChange([...models, { id, label: id }]);
    setDraft("");
  };

  const removeModel = (id: string) => {
    onChange(models.filter((model) => model.id !== id));
  };

  return (
    <div className="w-full">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">模型列表</span>
          <Badge tone={models.length > 0 ? "jade" : "default"}>{models.length} 个</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {models.length > 0 ? (
            <Button variant="ghost" size="sm" icon={<X className="size-3.5" />} onClick={() => onChange([])}>
              清空
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            icon={fetching ? <Spinner size="sm" /> : <Download className="size-3.5" />}
            loading={fetching}
            disabled={!canFetch}
            onClick={() => void fetchModels()}
          >
            拉取模型列表
          </Button>
        </div>
      </div>


      <div className="rounded-md border border-line bg-surface-2/60">
        {models.length === 0 ? (
          <p className="px-3 py-3 text-[11.5px] leading-5 text-ink-3">
            还没有模型。点「拉取模型列表」从服务商获取，或在下方手动添加模型 id。
          </p>
        ) : (
          <ul className="max-h-44 overflow-y-auto scroll-thin divide-y divide-line">
            {models.map((model) => (
              <li key={model.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-2">{model.id}</span>
                {model.label && model.label !== model.id ? (
                  <span className="hidden max-w-[45%] truncate text-[10.5px] text-ink-3 sm:block">{model.label}</span>
                ) : null}
                {model.thinking?<span className="shrink-0 text-[10px] text-ink-3">{model.thinking.supported?"支持思考":"无思考"}</span>:null}
                {typeof model.contextWindow === "number" && model.contextWindow > 0 ? (
                  <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">
                    {Math.round(model.contextWindow / 1000)}K
                  </span>
                ) : null}
                <IconButton label={`删除模型 ${model.id}`} size="sm" onClick={() => removeModel(model.id)}>
                  <Trash className="size-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input
            aria-label="手动添加模型"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addManual();
              }
            }}
            placeholder="手动添加模型 id，例如 deepseek-chat，回车添加"
          />
        </div>
        <Button variant="secondary" size="md" icon={<Plus className="size-3.5" />} onClick={addManual} disabled={!draft.trim()}>
          添加
        </Button>
      </div>

      {!canFetch ? (
        <p className="mt-1.5 text-[10.5px] leading-5 text-ink-3">填写 DeepSeek API Key 后才能拉取模型列表（演示服务可直接拉取）。</p>
      ) : null}
      {error ? <p className={cn("mt-1.5 text-[10.5px] leading-5 text-danger")}>{error}</p> : null}
    </div>
  );
}
