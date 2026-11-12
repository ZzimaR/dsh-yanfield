/** Deterministic local titles: no extra model call or transmission. */
export function isDefaultChatTitle(title: string): boolean {
  return !title.trim() || title.trim() === "新对话";
}

export function chatTitleFromMessage(content: string): string {
  const text = content.replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > 24 ? chars.slice(0, 24).join("") + "…" : text;
}
