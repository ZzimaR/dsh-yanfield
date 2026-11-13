"use client";

/**
 * 面板内的「技能」定义（空状态欢迎区与输入框 `/` 快捷菜单共用）。
 *
 * 每个技能对应一个内置预设（lib/defaults.ts 的 BUILTIN_PRESETS），
 * 这里只描述「点击后填入输入框的示例指令」，不是另一套假能力：
 * - imitate → 爆款仿写（开书）
 * - continue → 承接续写（续写并同步）
 * - deai → 去 AI 味
 * - diagnose → 章节体检
 */
import type { PromptPreset } from "@/lib/types";

export interface SkillCard {
  feature: PromptPreset["feature"];
  label: string;
  description: string;
  prompt: string;
}

export const SKILL_CARDS: SkillCard[] = [
  {
    feature: "imitate",
    label: "开书（融合仿写）",
    description: "借鉴目标作品的节奏与卖点，先搭一版能用的开篇",
    prompt: "帮我开书：先提炼一个可复用的开篇结构，再按这个结构写一段 300 字左右的开篇。",
  },
  {
    feature: "continue",
    label: "续写并同步",
    description: "接着末段写下去，并把新剧情要点同步给我",
    prompt:
      "接着本章最后一段续写 300 字左右，保持视角与语气一致，结尾留一个钩子；写完后把新增剧情要点同步给我，方便我更新档案。",
  },
  {
    feature: "deai",
    label: "去 AI 味",
    description: "删总结句、换掉抽象词，让文字更像人写的",
    prompt: "帮我给当前章节去 AI 味：先指出最像 AI 的三处，再把它们改写成更具体的动作、感官与对话。",
  },
  {
    feature: "diagnose",
    label: "章节诊断",
    description: "从钩子、信息密度、冲突到章末悬念逐项打分",
    prompt:
      "给当前章节做一次体检：开头钩子、信息密度、冲突推进、章末悬念各打分，并列出三处最值得改的地方。",
  },
];

/** 输入框 `/` 快捷菜单的选项（选中后填入 prompt，由作者确认发送） */
export interface SkillOption {
  label: string;
  hint?: string;
  prompt: string;
}

export const SKILL_OPTIONS: SkillOption[] = SKILL_CARDS.map((skill) => ({
  label: skill.label,
  hint: skill.description,
  prompt: skill.prompt,
}));
