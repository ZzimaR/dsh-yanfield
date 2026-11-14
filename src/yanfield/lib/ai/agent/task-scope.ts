import type { AgentChange } from "./types";

/** Short, unambiguous requests get defaults before the model sees the tool list. */
export function taskScope(message: string, selection: string | undefined, pending: AgentChange | undefined) {
  const text = message.trim();
  const directRequest = /(?:^|[。！？?!；;，,\n])\s*(?:请(?:帮我)?|麻烦你|帮我|能不能帮我|可以帮我|直接|照这个(?:方案|思路)|按这个(?:方案|思路|方向))\s*(?:把|将|改|修改|写|重写|删|更新|润色|补|生成)|(?:^|[.!?;\n])\s*(?:please|could you(?: please)?|can you(?: please)?)\s+(?:rewrite|update|delete|revise|edit|change|apply)\b/i.test(text);
  if (!directRequest && (
    /^(?:你(?:觉得|认为|怎么看)|怎么(?:改|写|调整)|如何(?:改|写|调整)|有什么建议|what do you think|do you think|in your opinion|how (?:should|would) (?:i|we|you)\b)/i.test(text) ||
    /不是[^。！？?\n]{1,30}(?:吗|麼|么)[？?。]?$/.test(text)
  )) return "discussion";
  if (/^(?:please )?(?:update|revise|sync) (?:the |this chapter'?s )?(?:chapter )?blueprint (?:from|based on|to match) (?:the )?(?:chapter|manuscript|prose)[.!]?$/i.test(text)) return "blueprint";
  if (/^(?:请基于上轮候选继续修改[：:]\s*)?(?:请)?(?:根据|按照|依据|照着)(?:当前章(?:节)?(?:的)?|本章(?:的)?|我的)?正文(?:帮我)?(?:重新)?(?:改|修改|更新|整理|生成|补全)(?:这章的|本章的)?章纲[。！!\s]*$/.test(text)) return "blueprint";
  if (selection && (/^(?:这里|这段|这句)?(?:帮我|请)?(?:润色|顺一点|改顺一点|润色一下|再顺一点)[。！!\s]*$/.test(text) ||
    /^(?:please )?(?:polish this|smooth this out|make this flow better)[.!]?$/i.test(text))) return "selection";
  if (/^(?:接着写|继续写|续写一下|续写)[。！!\s]*$/.test(text) || /^(?:please )?(?:keep writing|continue writing)[.!]?$/i.test(text)) return "append";
  if (pending && /^(?:请)?(?:帮我|直接)?(?:把|将)(?:上一稿|上轮(?:的)?(?:正文)?候选)/.test(text)) return "correct-draft";
  return undefined;
}

export const SCOPE_INSTRUCTIONS = {
  blueprint: "把当前章已保存的正文同步到章纲。覆盖开头到结尾，只提交该章的章纲候选。以正文已发生的事件为准。",
  selection: "作者在请求润色已选中的正文。只改善选区表达，保留事实和声音，选区外的文字由系统保留。调用 write_chapter。",
  append: "接着当前章已写内容往下写。用当前章末尾接续，结合章纲和相关设定，调用 write_chapter 的 append 模式。",
  "correct-draft": "作者在纠正紧邻的待确认正文候选。用 candidateId 读取该候选本身，按可用资料核对设定。对已读到的原句逐字引用，用 patch 修正。能用唯一的短词组定位时优先用短词组，original 和 replacement 都填纯文本。确有两个合理目标时问一句具体的问题。",
  discussion: "作者在讨论作品。必要时读取相关资料，然后直接回答问题，给出依据和建议。此轮只讨论，不提交修改候选。",
};
