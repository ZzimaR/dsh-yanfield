/**
 * DeepSeek 官方价目表（元 / 百万 tokens）。
 *
 * 数据来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
 * - 空闲时段单价 = 高峰时段单价的一半；
 * - 高峰时段＝北京时间周一至周五（不含法定节假日）9:00-12:00、14:00-18:00；
 *   其余时段（含周末与法定节假日全天）为空闲时段。
 * - 模型名以 deepseek-flash / deepseek-v4-pro 为准；deepseek-v4-flash、
 *   deepseek-v4-flash-vision-exp 是旧名，仍按 Flash 计费。
 *
 * 价目表只在代码里维护一份；官方调价时改这里即可，不依赖联网抓页面。
 */
import type { AiPricing } from "@/lib/types";

export const DEEPSEEK_PRICE_SOURCE_URL = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";

export type PricePeriod = "peak" | "offpeak";

export interface DeepSeekRate {
  /** 普通输入（缓存未命中），元 / 百万 tokens */
  inputPerMillion: number;
  /** 缓存命中输入，元 / 百万 tokens */
  cachedInputPerMillion: number;
  /** 输出，元 / 百万 tokens */
  outputPerMillion: number;
}

/** 高峰时段：北京时间工作日 9:00-12:00、14:00-18:00（左闭右开，分钟）。 */
const PEAK_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [9 * 60, 12 * 60],
  [14 * 60, 18 * 60],
];

/** 2026 年法定节假日（放假当天；调休上班日仍按周末算空闲，与官方口径一致）。 */
const CN_HOLIDAYS_2026: ReadonlyArray<string> = [
  "2026-01-01", "2026-01-02", "2026-01-03",
  "2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",
  "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
  "2026-04-04", "2026-04-05", "2026-04-06",
  "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
  "2026-06-19", "2026-06-20", "2026-06-21",
  "2026-09-25", "2026-09-26", "2026-09-27",
  "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07",
];

export const DEEPSEEK_PRICE_TABLE: Record<string, Record<PricePeriod, DeepSeekRate>> = {
  "deepseek-flash": {
    peak: { inputPerMillion: 2, cachedInputPerMillion: 0.04, outputPerMillion: 8 },
    offpeak: { inputPerMillion: 1, cachedInputPerMillion: 0.02, outputPerMillion: 4 },
  },
  "deepseek-v4-pro": {
    peak: { inputPerMillion: 9, cachedInputPerMillion: 0.3, outputPerMillion: 27 },
    offpeak: { inputPerMillion: 4.5, cachedInputPerMillion: 0.15, outputPerMillion: 13.5 },
  },
};

/** 旧模型名 → 现价目表里的名字。 */
const MODEL_ALIASES: Record<string, string> = {
  "deepseek-v4-flash": "deepseek-flash",
  "deepseek-v4-flash-vision-exp": "deepseek-flash",
};

export function canonicalPricingModel(model: string): string | null {
  const raw = model.trim();
  if (!raw) return null;
  const canonical = MODEL_ALIASES[raw] ?? raw;
  return DEEPSEEK_PRICE_TABLE[canonical] ? canonical : null;
}

const BEIJING_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const BEIJING_CLOCK = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function beijingNow(now: Date): { date: string; weekday: string; minutes: number } {
  const date = BEIJING_DATE.format(now); // yyyy-mm-dd
  const parts = BEIJING_CLOCK.formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(pick("hour")) % 24;
  const minute = Number(pick("minute"));
  return { date, weekday: pick("weekday"), minutes: hour * 60 + minute };
}

/** 现在是否处于 DeepSeek 的高峰计价时段（按北京时间判断）。
 * 法定节假日只内置了 2026 年；表中没有的年份按「非节假日」处理，会略微高估。 */
export function isDeepSeekPeakTime(now: Date = new Date()): boolean {
  const { date, weekday, minutes } = beijingNow(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  if (CN_HOLIDAYS_2026.includes(date)) return false;
  return PEAK_WINDOWS.some(([from, to]) => minutes >= from && minutes < to);
}

export function currentPricePeriod(now: Date = new Date()): PricePeriod {
  return isDeepSeekPeakTime(now) ? "peak" : "offpeak";
}

export function pricePeriodLabel(period: PricePeriod): string {
  return period === "peak" ? "高峰时段" : "空闲时段";
}

/** 整个价目表的两种时段，供设置页展示/一键采用。 */
export function deepseekPricingRates(model: string): { period: string; periodKey: PricePeriod; rate: DeepSeekRate }[] | null {
  const canonical = canonicalPricingModel(model);
  if (!canonical) return null;
  const entry = DEEPSEEK_PRICE_TABLE[canonical];
  return (["peak", "offpeak"] as PricePeriod[]).map((periodKey) => ({
    period: pricePeriodLabel(periodKey),
    periodKey,
    rate: entry[periodKey],
  }));
}

/** 当前时段的单价，转成设置里的 AiPricing 形状（元 / 百万 tokens）。 */
export function builtinAiPricing(model: string, now: Date = new Date()): AiPricing | null {
  const canonical = canonicalPricingModel(model);
  if (!canonical) return null;
  const rate = DEEPSEEK_PRICE_TABLE[canonical][currentPricePeriod(now)];
  return {
    inputPerMillion: rate.inputPerMillion,
    cachedInputPerMillion: rate.cachedInputPerMillion,
    outputPerMillion: rate.outputPerMillion,
  };
}
