/**
 * 设定 / 大纲等「AI 帮我写」的提示词拼装。
 * 点开面板不会请求模型；用户写下想法并确认后，才把想法、已有草稿和字段指令合成一条作者任务。
 */

export type AssistMode = "write" | "continue" | "polish";

/** 按字段生成的基础指令。已有草稿通过 composeAssistBrief 另附，避免在指令里复制长文本。 */
export function buildFieldInstruction(mode: AssistMode, field: string, hasDraft: boolean): string {
  const onlyField = "只输出这个字段的成稿，不要标题，不要解释。";
  switch (mode) {
    case "write":
      return hasDraft
        ? `请完善「${field}」。保留草稿里的关键想法，补上具体的规则、限制或代价，避免空话套话。${onlyField}`
        : `请帮我写「${field}」。若我补充了想法，严格按想法展开，不要换成别的内容；没有补充时，贴合本书已有信息来写。${onlyField}`;
    case "continue":
      return hasDraft
        ? `请基于我提供的现有「${field}」继续写，保持信息与语气一致，不要重复已有内容。${onlyField}`
        : `请补全「${field}」，作为后续内容的起点，具体、克制。${onlyField}`;
    case "polish":
      return hasDraft
        ? `请优化我提供的「${field}」：保留原意与关键信息，让表达更准确、更具体。${onlyField}`
        : `请优化「${field}」的写法：更具体，避免空泛。${onlyField}`;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

/** 兼容旧调用：current 非空即视为已有草稿。 */
export function buildAiInstruction(mode: AssistMode, field: string, current?: string): string {
  return buildFieldInstruction(mode, field, Boolean(current && current.trim()));
}

export function labeledDraft(parts: { label: string; value: string }[]): string {
  return parts
    .map((part) => ({ label: part.label, value: part.value.trim() }))
    .filter((part) => part.value)
    .map((part) => `${part.label}：\n${part.value}`)
    .join("\n\n");
}

/**
 * 把字段指令、已有草稿和用户刚写下的想法合成一条作者任务。
 * message 与 instruction 使用同一段文本：设定卡 / 大纲预设读 {{message}}，改写类预设读 {{instruction}}。
 */
export function composeAssistBrief(input: { instruction: string; idea?: string; draft?: string }): {
  message: string;
  instruction: string;
  selection?: string;
} {
  const instruction = input.instruction.trim();
  const idea = input.idea?.trim() ?? "";
  const draft = input.draft?.trim() ?? "";
  const parts: string[] = [];
  if (instruction) parts.push(instruction);
  if (draft) {
    parts.push(`我已经写了一点，请在此基础上完善，保留其中的关键信息，不要另起一套：\n${draft}`);
  }
  if (idea) parts.push(`我的想法（优先遵守）：\n${idea}`);
  const message = parts.join("\n\n");
  return {
    message,
    instruction: message,
    ...(draft ? { selection: draft } : {}),
  };
}

/** 只传了 instruction 的旧调用，也要能进读 {{message}} 的预设。 */
export function resolveTaskAuthorText(message?: string, instruction?: string): { message: string; instruction: string } {
  const instructionText = (instruction ?? "").trim();
  const messageText = (message ?? "").trim() || instructionText;
  return { message: messageText, instruction: instructionText };
}

/** 模板末尾常有「请输出整张卡 / 整份大纲」，把作者任务再强调一次，避免盖过字段级要求。 */
export function appendTaskConstraint(userContent: string, instruction: string): string {
  if (!instruction.trim()) return userContent;
  return `${userContent}\n\n【输出约束】\n以作者任务为准，输出可直接保存的成稿，不要解释你做了什么。任务若只要求某一个字段，就不要扩写成整份大纲或整张卡片。`;
}
