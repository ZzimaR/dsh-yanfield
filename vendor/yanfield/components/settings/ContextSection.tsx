"use client";

import * as React from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button, Card, Input, Segmented, Slider, Switch, Textarea, useToast } from "@/components/ui/kit";
import type {OfficialPricing} from "@/lib/ai/official-pricing";
import { canonicalPricingModel, currentPricePeriod, pricePeriodLabel } from "@/lib/ai/deepseek-pricing";
import { apiGet, useApi } from "@/lib/client/api";
import { DEFAULT_CONTEXT_CONFIG, type AppSettings, type ContextConfig, type DashboardStats } from "@/lib/types";
import { cn } from "@/lib/ui/cn";
import { AiSpendLine } from "@/components/ai/AiSpendLine";

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

/** 上下文预算常用档位（token）。0 = 不限制。 */
const BUDGET_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: "不限" },
  { value: 96000, label: "96k" },
  { value: 128000, label: "128k" },
  { value: 256000, label: "256k" },
  { value: 512000, label: "512k" },
];

function budgetLabel(value: number): string {
  return value === 0 ? "不限" : `${Math.round(value / 1000)}k tokens`;
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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-serif text-lg text-ink">AI 与上下文</h2>
          <p className="mt-1 max-w-[62ch] text-[12px] leading-6 text-ink-3">
            每次 AI 请求会按这里的开关装配上下文。素材可见、预算可控，写长篇才不会越写越跑偏。
          </p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" icon={<RotateCcw className="size-3.5" />} onClick={reset}>
          恢复默认
        </Button>
      </div>

      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <SlidersHorizontal className="size-3.5 text-ink-3" aria-hidden />
          上下文组成
        </h3>
        <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
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
        <h3 className="text-[13px] font-medium text-ink">上下文预算与策略</h3>
        <p className="mt-1 text-[11.5px] leading-5 text-ink-3">
          装配器按优先级把大纲、档案、角色、设定塞进预算：超出时先丢弃低优先级块，再截断最长的块。预算上限由模型上下文窗口决定。
        </p>
        <div className="mt-4 space-y-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11.5px] text-ink-3">上下文预算</p>
              <span className="font-mono text-[11.5px] text-accent">{budgetLabel(context.contextBudget)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {BUDGET_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => patchContext({ contextBudget: preset.value })}
                  className={cn(
                    "rounded-sm border px-2 py-1 font-mono text-[11px] transition-colors",
                    context.contextBudget === preset.value
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-surface-2/70 text-ink-3 hover:border-line-strong hover:text-ink",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <Input
              className="mt-2"
              label="自定义预算（tokens）"
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              value={context.contextBudget === 0 ? "" : String(context.contextBudget)}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                patchContext({ contextBudget: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 });
              }}
              placeholder="自定义，例如 16000"
              hint="0 = 不限制（由模型上下文窗口决定上限）"
            />
          </div>
          <div className="h-px bg-line/70" />
          <Slider
            label="单次输出上限（0 = 自动）"
            min={0}
            max={64000}
            step={250}
            value={context.maxTokens}
            hint={context.maxTokens === 0 ? "自动" : `${context.maxTokens} tokens`}
            onChange={(value) => patchContext({ maxTokens: value })}
          />
          <p className="text-[11.5px] leading-5 text-ink-3">
            控制每次模型调用，主编规划、正文写作和资料整理均生效；多步任务总用量可能超过此值。0 自动选择：使用 DeepSeek 接口的默认输出上限；并非无限。长篇写作可尝试 16000–32000 tokens，再按模型支持范围调整。tokens 不等于中文字数；上限越高，允许生成的内容越多，也可能增加等待和费用。
          </p>
          <Slider
            label="前情摘要章数"
            min={0}
            max={10}
            step={1}
            value={context.includeChapterSummaries && context.includeChapterSummaries > 0 ? context.includeChapterSummaries : 0}
            hint={context.includeChapterSummaries === 0 ? "不包含" : `最近 ${context.includeChapterSummaries} 章`}
            onChange={(value) => patchContext({ includeChapterSummaries: value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
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
      </Card>

      <Card className="space-y-3 p-4">
        <div>
          <h3 className="text-[14px] font-medium text-ink">用量与费用</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            优先采用接口返回的用量；缓存命中与普通输入分别估算，未报告缓存的部分按普通输入单价估算。实际账单以服务商为准。
          </p>
          {builtinModel ? (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
              {builtinModel} 的价格已内置 DeepSeek 官方价目表，目前按{builtinPeriod}计算：空闲时段是高峰时段的一半，高峰为北京时间工作日 9:00–12:00、14:00–18:00（法定节假日全天按空闲）。官方调价时同步更新插件版本即可。
            </p>
          ) : null}
        </div>
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
        <div className="grid gap-3 sm:grid-cols-2">
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
