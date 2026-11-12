/**
 * 对话栏里的「改稿意图」识别。
 *
 * 右栏对话默认只聊天、不动正文；但作者更自然的习惯是直接说「帮我改一下这章」「这段扩写」
 * （马良写作就是这么用的）。这里把这类话识别成一次正文任务，交给 /api/ai/task 生成
 * 可应用 action，再走「审阅 → 写回正文」，避免每次都去点上面的 AI 快捷条。
 *
 * 只认「有明显改稿动词 + 指代当前章/段」或极短的单独命令，避免把普通聊天误判成改稿。
 */

/** 能产出正文 action 的任务（与 lib/ai/engine.ts 的 proseAction 对齐） */
export type EditIntentFeature = "continue" | "expand" | "polish" | "rewrite" | "deai";

export interface EditIntent {
  feature: EditIntentFeature;
  /** 中文动词，用于按钮/提示文案 */
  label: string;
  /** 模板需要选中片段（没有选中时用整章正文兜底） */
  needsSelection: boolean;
}

const RULES: Array<{ feature: EditIntentFeature; label: string; needsSelection: boolean; pattern: RegExp }> = [
  {
    feature: "continue",
    label: "续写",
    needsSelection: false,
    pattern: /(续写|接着写|往下写|继续写|写下一段|接下一段)/,
  },
  {
    feature: "deai",
    label: "去 AI 味",
    needsSelection: true,
    pattern: /(去\s*AI\s*味|去掉\s*AI\s*味|AI\s*味|ai味|机器味)/i,
  },
  {
    feature: "polish",
    label: "润色",
    needsSelection: true,
    pattern: /(润色|打磨一下|修饰一下|通顺一下|语言打磨)/,
  },
  {
    feature: "expand",
    label: "扩写",
    needsSelection: true,
    pattern: /(扩写|展开写|写细|加细节|丰富一下|写长一点|写得更细)/,
  },
  {
    feature: "rewrite",
    label: "改写",
    needsSelection: true,
    pattern: /(改写|重写|改一下这章|改这章|修改这章|改一下这段|改这段|改一下这一章|重写这章|换个视角写)/,
  },
];

/** 出现这些词，才说明作者指的是「当前章 / 当前段 / 正文」 */
const TARGET_HINT = /(这章|本章|这一章|这段|这一段|正文|全章|整章|这节|当前章|当前段)/;

/**
 * 识别一句话里的改稿意图。
 * - 「帮我改一下这章，然后扩写一下」→ expand
 * - 「续写」→ continue（短命令即可）
 * - 「这段能怎么写更好？」→ null（提问，不改稿）
 */
export function detectEditIntent(text: string): EditIntent | null {
  const value = text.trim();
  if (!value) return null;
  const hasTarget = TARGET_HINT.test(value);
  for (const rule of RULES) {
    if (!rule.pattern.test(value)) continue;
    // 没有「这章/这段/正文」时：只接受很短的单命令（如「续写」「扩写一下」），避免聊天误伤
    if (!hasTarget) {
      if (value.length > 16) continue;
      if (rule.feature !== "continue" && value.length > 12) continue;
    }
    return { feature: rule.feature, label: rule.label, needsSelection: rule.needsSelection };
  }
  return null;
}
