import type { TranslateValue } from "../core"

/** Built-in preset names and AI feature labels. The preset bodies stay Chinese;
 *  every preset gets a language directive so replies follow the author's language. */
export const presets: Record<string, TranslateValue> = {
  "通用写作搭档": "Writing partner",
  "承接续写": "Continue the scene",
  "扩写细节": "Expand details",
  "润色语言": "Polish prose",
  "换角度改写": "Rewrite from a new angle",
  "去 AI 味": "Remove AI tone",
  "章节体检": "Chapter checkup",
  "生成总纲": "Generate story outline",
  "生成卷纲": "Generate volume outline",
  "生成章纲": "Generate chapter outline",
  "提取本章档案": "Extract chapter archive",
  "本章摘要": "Chapter summary",
  "角色卡补全": "Complete character card",
  "设定卡补全": "Complete world entry",
  "伏笔卡补全": "Complete foreshadowing card",
  "一致性检查": "Consistency check",
  "节奏分析": "Pacing analysis",
  "起名": "Titles",
  "写简介": "Write synopsis",
  "爆款仿写": "Viral-style imitation",
  "智能体对话": "Agent chat",
  "AI 续写": "AI continuation",
  "扩写": "Expand",
  "润色": "Polish",
  "改写": "Rewrite",
  "提取故事档案": "Extract story archive",
  "简介": "Synopsis",
  "自定义任务": "Custom task",
}
