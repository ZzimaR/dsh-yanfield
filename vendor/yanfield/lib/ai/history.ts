/**
 * 对话历史的预算裁剪（不生成语义摘要）。
 *
 * 右侧 AI 每次只带最近若干条消息进模型；但当单条消息很长时，即使条数不多，
 * 也可能把上下文顶爆。这里按「条数上限 + 总字符上限」从最新往前保留：
 * - 条数超限：丢弃更早的消息；
 * - 字符超限：丢弃更早的消息，直到总字符数回到预算内（至少保留最新的 1 条）。
 *
 * 被丢弃的历史不会发给模型；调用方应在 system prompt 里说明「更早的对话已省略」，
 * 让模型以最近的消息和上下文为准，而不是去猜。
 */
export interface ChatHistoryEntry {
  role: string;
  content: string;
}

/** 最多保留 10 条（与历史行为一致）。 */
export const DEFAULT_HISTORY_MESSAGES = 10;

/** 历史消息总字符上限（约 12k tokens）；超过就从最早的消息开始丢。 */
export const DEFAULT_HISTORY_CHARS = 24000;

export interface TrimmedHistory<T extends ChatHistoryEntry> {
  kept: T[];
  /** 是否有消息被丢掉（调用方据此在 system prompt 里加提示）。 */
  trimmed: boolean;
  /** 被丢掉的消息条数。 */
  dropped: number;
  /** 保留下来的总字符数。 */
  chars: number;
}

export function trimChatHistory<T extends ChatHistoryEntry>(
  messages: T[],
  options: { maxMessages?: number; maxChars?: number } = {},
): TrimmedHistory<T> {
  const maxMessages = Math.max(1, Math.floor(options.maxMessages ?? DEFAULT_HISTORY_MESSAGES));
  const maxChars = Math.max(1, Math.floor(options.maxChars ?? DEFAULT_HISTORY_CHARS));
  const recent = messages.slice(-maxMessages);
  const kept: T[] = [];
  let chars = 0;
  let shortened=false;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    let content = recent[index].content ?? "";
    if(kept.length===0&&content.length>maxChars) {
      const marker="\n[中间内容因预算省略]\n";
      const available=Math.max(0,maxChars-marker.length);
      const head=Math.floor(available/3),tail=available-head;
      content=maxChars<marker.length?content.slice(-maxChars):content.slice(0,head)+marker+(tail?content.slice(-tail):"");
      shortened=true;
    }
    // 至少保留最新一条；再往前只要不超预算就继续保留
    if (kept.length > 0 && chars + content.length > maxChars) break;
    kept.unshift(content===recent[index].content?recent[index]:{...recent[index],content});
    chars += content.length;
  }
  return {
    kept,
    trimmed: shortened || kept.length < messages.length,
    dropped: messages.length - kept.length,
    chars,
  };
}
