"use client";

import * as React from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button, Card, Input, Segmented, Slider, Switch, Textarea, useToast } from "@/components/ui/kit";
import type {OfficialPricing} from "@/lib/ai/official-pricing";
import { canonicalPricingModel, currentPricePeriod, pricePeriodLabel } from "@/lib/ai/deepseek-pricing";
import { apiGet, useApi } from "@/lib/client/api";
import { DEFAULT_CONTEXT_CONFIG, MAX_CONTEXT_BUDGET, MAX_OUTPUT_TOKENS, type AppSettings, type ContextConfig, type DashboardStats } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { AiSpendLine } from "@/components/ai/AiSpendLine";
import { BUDGET_OPTIONS } from "@/components/ai/model-info";

export interface ContextSectionProps {
  settings: AppSettings | undefined;
  update: (patch: Partial<AppSettings>) => void;
}

type BoolKey =
  | "includeNovelOutline"
  | "includeVolumeOutline"
  | "includeChapterBlueprint"
  | "includeArchives"
  | "includeCharacters"
  | "includeWorld"
  | "includeForeshadows"
  | "includeStyleGuide"
  | "includeSelection";

const CONTEXT_SWITCHES: { key: BoolKey; label: string; hint: string }[] = [
  { key: "includeNovelOutline", label: "全书大纲", hint: "主线、主题、结局方向" },
  { key: "includeVolumeOutline", label: "本卷大纲", hint: "当前卷的弧线与关键事件" },
  { key: "includeChapterBlueprint", label: "本章蓝图", hint: "本章目标、冲突、场景节拍" },
  { key: "includeArchives", label: "故事档案", hint: "角色状态、设定变化、数值总账" },
  { key: "includeCharacters", label: "角色卡", hint: "相关角色的档案与关系" },
  { key: "includeWorld", label: "世界设定", hint: "地点、体系、势力等硬设定" },
  { key: "includeForeshadows", label: "伏笔账本", hint: "未回收的伏笔与提示" },
  { key: "includeStyleGuide", label: "文风指南", hint: "作品的语气、视角、禁忌词" },
  { key: "includeSelection", label: "当前选中文本", hint: "在编辑器里选中一段再让 AI 处理" },
];

const CUSTOM_INSTRUCTION_LIMIT = 600;

function BudgetControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [editingCustom, setEditingCustom] = React.useState(false);
  const [draft, setDraft] = React.useState(value > 0 ? String(value) : "");
  const id = React.useId();
  const selected = BUDGET_OPTIONS.find((option) => option.value === value);
  const custom = editingCustom || !selected;
  const amount = Number(draft);
  const valid = draft !== "" && Number.isInteger(amount) && amount > 0 && amount <= MAX_CONTEXT_BUDGET;

  React.useEffect(() => {
    setDraft(value > 0 ? String(value) : "");
    setEditingCustom(false);
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <label htmlFor={id} className="text-[12px] font-medium text-ink">上下文预算</label>
        <select
          id={id}
          value={custom ? "custom" : value}
          onChange={(event) => {
            const next = event.target.value;
            setEditingCustom(next === "custom");
            if (next !== "custom") {
              const budget = Number(next);
              setDraft(budget > 0 ? next : "");
              onChange(budget);
            }
          }}
          className="min-w-32 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink focus-visible:outline-accent"
        >
          {BUDGET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.value === 0 ? "由模型决定" : `${option.label} tokens`}</option>
          ))}
          <option value="custom">自定义</option>
        </select>
      </div>
      {custom ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${id}-amount`} className="text-[12px] text-ink-3">自定义上限（tokens）</label>
          <div className="flex items-center gap-2">
            <input
              id={`${id}-amount`}
              type="number"
              min={1}
              max={MAX_CONTEXT_BUDGET}
              step={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && valid) {
                  event.preventDefault();
                  onChange(amount);
                }
              }}
              className="w-28 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] tabular-nums text-ink focus-visible:outline-accent"
            />
            <Button size="sm" variant="secondary" disabled={!valid || amount === value} onClick={() => onChange(amount)}>应用</Button>
          </div>
        </div>
      ) : null}
      {custom && draft !== "" && !valid ? (
        <p role="alert" className="text-[11px] text-danger">请输入 1 到 2,000,000 之间的整数。</p>
      ) : null}
      <p className="text-[11px] leading-5 text-ink-3">超出预算时，优先保留高优先级资料。请求仍受模型窗口限制。</p>
    </div>
  );
}

export function ContextSection({ settings, update }: ContextSectionProps) {
  const { toast } = useToast();
  const statsApi = useApi<DashboardStats>("/api/stats");
  const [official,setOfficial]=React.useState<OfficialPricing|null>(null);
  const [fetchingPrice,setFetchingPrice]=React.useState(false);
  const [priceError,setPriceError]=React.useState("");
  if (!settings) return null;
  const context = settings.defaultContext;
  const pricing = settings.aiPricing;
  // 内置价目表：DeepSeek 官方模型（以及走 DeepSeek 的 harness 通道）没填单价时，
  // 服务端会直接返回按当前时段算出的官方价，这里只负责把规则讲清楚。
  const builtinModel = canonicalPricingModel(settings.models.chat.model);
  const builtinPeriod = pricePeriodLabel(currentPricePeriod());
  const stats = statsApi.data;

  const patchContext = (patch: Partial<ContextConfig>) => {
    update({ defaultContext: { ...context, ...patch } });
  };

  const reset = () => {
    update({ defaultContext: DEFAULT_CONTEXT_CONFIG });
    toast({ title: "已恢复默认上下文配置", description: "改动会自动保存。", tone: "success" });
  };

  return (
    <div className="@container/context space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg text-ink">AI 与上下文</h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-6 text-ink-3">
            设置 AI 默认可读取的资料和每次调用的上限。
          </p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" icon={<RotateCcw className="size-3.5" />} onClick={reset}>
          恢复默认
        </Button>
      </div>

      <Card className="space-y-4 p-4">
        <BudgetControl value={context.contextBudget} onChange={(contextBudget) => patchContext({ contextBudget })} />
        <Slider
          label="单次输出上限"
          min={0}
          max={MAX_OUTPUT_TOKENS}
          step={250}
          value={context.maxTokens}
          hint={context.maxTokens === 0 ? "自动" : `${context.maxTokens.toLocaleString()} tokens`}
          onChange={(maxTokens) => patchContext({ maxTokens })}
        />
      </Card>

      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <SlidersHorizontal className="size-3.5 text-ink-3" aria-hidden />
          上下文组成
        </h3>
        <div className="mt-3 grid gap-x-6 gap-y-3 @min-[420px]/context:grid-cols-2">
          {CONTEXT_SWITCHES.map(({ key, label, hint }) => (
            <Switch
              key={key}
              checked={context[key]}
              label={label}
              hint={hint}
              onChange={(checked) => patchContext({ [key]: checked } as Partial<ContextConfig>)}
            />
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <details>
          <summary className="cursor-pointer text-[13px] font-medium text-ink">前情、档案与角色卡细节</summary>
          <div className="mt-4 space-y-4">
            <Slider
              label="前情摘要章数"
              min={0}
              max={10}
              step={1}
              value={context.includeChapterSummaries && context.includeChapterSummaries > 0 ? context.includeChapterSummaries : 0}
              hint={context.includeChapterSummaries === 0 ? "不包含" : `最近 ${context.includeChapterSummaries} 章`}
              onChange={(value) => patchContext({ includeChapterSummaries: value })}
            />
            <div className="grid gap-3 @min-[420px]/context:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11.5px] text-ink-3">前情摘要形式</p>
                <Segmented
                  options={[
                    { value: "summary", label: "摘要" },
                    { value: "tail", label: "章末片段" },
                  ]}
                  value={context.chapterSummaryMode}
                  onChange={(value) => patchContext({ chapterSummaryMode: value === "tail" ? "tail" : "summary" })}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11.5px] text-ink-3">角色卡详细度</p>
                <Segmented
                  options={[
                    { value: "brief", label: "精简" },
                    { value: "standard", label: "标准" },
                    { value: "full", label: "完整" },
                  ]}
                  value={context.characterDetail}
                  onChange={(value) =>
                    patchContext({
                      characterDetail: value === "brief" || value === "full" ? value : "standard",
                    })
                  }
                />
              </div>
            </div>
            <Slider
              label="档案回溯深度"
              min={1}
              max={6}
              step={1}
              value={context.archiveDepth}
              hint={`最近 ${context.archiveDepth} 章的档案`}
              onChange={(value) => patchContext({ archiveDepth: value })}
            />
          </div>
        </details>
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-medium text-ink">用量与费用</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            费用按接口用量估算，实际账单以服务商为准。
          </p>
          {builtinModel ? (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
              {builtinModel} 内置参考价 · 当前{builtinPeriod}
            </p>
          ) : null}
        </div>
        {stats ? (
          <div className="space-y-1">
            <AiSpendLine
              prefix="今日 "
              cachedInputTokens={stats.todayCachedInputTokens}
              cacheReportedInputTokens={stats.todayCacheReportedInputTokens}
              promptTokens={stats.todayPromptTokens}
              completionTokens={stats.todayCompletionTokens}
              calls={stats.todayAiCalls}
              price={pricing}
            />
            <AiSpendLine
              prefix="累计 "
              cachedInputTokens={stats.aiCachedInputTokens}
              cacheReportedInputTokens={stats.aiCacheReportedInputTokens}
              promptTokens={stats.aiPromptTokens}
              completionTokens={stats.aiCompletionTokens}
              calls={stats.aiCalls}
              price={pricing}
            />
          </div>
        ) : (
          <p className="text-[12px] text-ink-3">{statsApi.loading ? "正在统计用量…" : "还没有用量记录。"}</p>
        )}
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-[12px] font-medium text-ink">查看官方价与自定义单价</summary>
          <div className="mt-3 space-y-3">
            <Button size="sm" variant="secondary" loading={fetchingPrice} onClick={async()=>{
              setFetchingPrice(true);setPriceError("");setOfficial(null);
              try{setOfficial(await apiGet<OfficialPricing>("/api/ai/pricing"));}
              catch(error){setPriceError(error instanceof Error?error.message:"官方单价获取失败");}
              finally{setFetchingPrice(false);}
            }}>获取默认模型官方单价</Button>
            {priceError?<p role="alert" className="text-[12px] text-danger">{priceError}</p>:null}
            {official && official.model===settings.models.chat.model && official.providerId===settings.models.chat.providerId?<div className="space-y-2 rounded-md border border-line p-3 text-[12px]">
              <p>{official.model} · 元 / 百万 tokens</p>
              <p className="text-[11px] text-ink-3">获取时间：{new Date(official.fetchedAt).toLocaleString()} · <a href={official.source} target="_blank" rel="noreferrer" className="text-accent underline">官方来源与时段规则</a></p>
              {official.rates.map(rate=><div key={rate.period} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                <span>{rate.period}：输入 {rate.inputPerMillion} · 缓存命中 {rate.cachedInputPerMillion} · 输出 {rate.outputPerMillion}</span>
                <Button size="sm" onClick={()=>{update({aiPricing:{inputPerMillion:rate.inputPerMillion,outputPerMillion:rate.outputPerMillion,cachedInputPerMillion:rate.cachedInputPerMillion}});toast({title:"已采用官方单价",description:`${official.model} · ${rate.period} · 已填入普通输入、缓存命中和输出三档单价`,tone:"success"});}}>采用此单价</Button>
              </div>)}
              <p className="text-[11px] text-ink-3">当前费用估算共用一组单价。选择后用于后续显示估算，不是逐次实际账单；缓存、峰谷时段和切换模型都会影响准确度。第三方中转价不适用。</p>
            </div>:null}
            <div className="grid gap-3 @min-[420px]/context:grid-cols-2">
              <Input
                label="普通输入单价（缓存未命中）"
                type="number"
                min={0}
                step="0.01"
                value={pricing.inputPerMillion ? String(pricing.inputPerMillion) : ""}
                placeholder="0"
                hint="元 / 百万 tokens"
                onChange={(event) => {
                  const num = event.target.value.trim() === "" ? 0 : Number(event.target.value);
                  if (!Number.isFinite(num) || num < 0) return;
                  update({ aiPricing: { ...pricing, inputPerMillion: num } });
                }}
              />
              <Input label="缓存命中输入单价" type="number" min={0} step="0.001"
                value={pricing.cachedInputPerMillion==null?"":String(pricing.cachedInputPerMillion)}
                placeholder="未配置" hint="元 / 百万 tokens；留空为未知，填 0 表示免费"
                onChange={event=>{const value=event.target.value.trim();const rate=value===""?null:Number(value);if(rate!==null&&(!Number.isFinite(rate)||rate<0))return;update({aiPricing:{...pricing,cachedInputPerMillion:rate}});}}/>
              <Input
                label="输出单价"
                type="number"
                min={0}
                step="0.01"
                value={pricing.outputPerMillion ? String(pricing.outputPerMillion) : ""}
                placeholder="0"
                hint="元 / 百万 tokens"
                onChange={(event) => {
                  const num = event.target.value.trim() === "" ? 0 : Number(event.target.value);
                  if (!Number.isFinite(num) || num < 0) return;
                  update({ aiPricing: { ...pricing, outputPerMillion: num } });
                }}
              />
            </div>
          </div>
        </details>
      </Card>

      <Card className="p-4">
        <Textarea
          label="自定义指令（追加到每次请求末尾）"
          rows={3}
          maxLength={CUSTOM_INSTRUCTION_LIMIT}
          value={context.customInstruction}
          onChange={(event) => patchContext({ customInstruction: event.target.value })}
          placeholder="例如：保持冷峻克制的语气，不要使用现代网络用语，避免解释性旁白。"
          hint={`${context.customInstruction.length}/${CUSTOM_INSTRUCTION_LIMIT} 字 · 留空则不加`}
        />
      </Card>
    </div>
  );
}
