"use client";

import * as React from "react";
import { Markdown } from "@/components/ui/kit";

/** Keep a partial Markdown block in plaintext until its syntax is complete. */
function completeBlockEnd(text: string, limit: number): number {
  let fence = "";
  let end = 0;
  let offset = 0;
  for (const line of text.slice(0, limit).split("\n").slice(0, -1)) {
    offset += line.length + 1;
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker && !fence) fence = marker;
    else if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = "";
    else if (!fence && !line.trim()) end = offset;
  }
  return end;
}

export function AgentReply({ text, length }: { text: string; length: number }) {
  const partial = length < text.length;
  const end = partial ? completeBlockEnd(text, length) : text.length;
  return <div className="break-words px-1 py-1 text-[13px] leading-[1.9] text-ink-2" data-testid="agent-reply">
    {end > 0 ? <Markdown text={text.slice(0, end)} /> : null}
    {partial ? <p className="whitespace-pre-wrap ai-caret" aria-hidden>{text.slice(end, length)}</p> : null}
  </div>;
}

export function useAgentReplyReveal(runId: string, text: string, animate: boolean): number {
  const [reveal, setReveal] = React.useState({ runId, length: 0 });
  const length = animate && reveal.runId === runId ? reveal.length : animate ? 0 : text.length;
  React.useEffect(() => {
    if (!animate || length >= text.length) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => { if (media.matches) setReveal({ runId, length: text.length }); };
    if (media.matches) { reduced(); return; }
    const timer = window.setTimeout(() => {
      // Cap the duration for long answers while keeping each update small.
      const step = Math.max(4, Math.min(36, Math.ceil(text.length / 72)));
      let end = Math.min(text.length, length + step);
      if (end < text.length && /[\uDC00-\uDFFF]/.test(text[end])) end++;
      setReveal({ runId, length: end });
    }, length === 0 ? 16 : 24);
    media.addEventListener("change", reduced);
    return () => { window.clearTimeout(timer); media.removeEventListener("change", reduced); };
  }, [animate, length, runId, text]);
  return length;
}
