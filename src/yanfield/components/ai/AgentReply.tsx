"use client";

import { Markdown } from "@/components/ui/kit";

/** Keep a partial Markdown block in plaintext until its syntax is complete. */
function completeBlockEnd(text: string): number {
  let fence = "";
  let end = 0;
  let offset = 0;
  for (const line of text.split("\n").slice(0, -1)) {
    offset += line.length + 1;
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker && !fence) fence = marker;
    else if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = "";
    else if (!fence && !line.trim()) end = offset;
  }
  return end;
}

export function AgentReply({ text, streaming }: { text: string; streaming?: boolean }) {
  const end = streaming ? completeBlockEnd(text) : text.length;
  return <div className="break-words px-1 py-1 text-[13px] leading-[1.9] text-ink-2" data-testid="agent-reply">
    {end > 0 ? <Markdown text={text.slice(0, end)} /> : null}
    {streaming ? <p className="whitespace-pre-wrap ai-caret">{text.slice(end)}</p> : null}
  </div>;
}
