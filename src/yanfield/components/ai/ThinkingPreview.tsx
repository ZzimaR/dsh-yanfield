"use client"

import * as React from "react"
import { ChevronDown, PenTool } from "lucide-react"
import { useT } from "@/lib/i18n"

export function ThinkingPreview({
  text, active = false, completed = "", live = active,
}: { text: string; active?: boolean; completed?: string; live?: boolean }) {
  const tr = useT()
  const preview = React.useRef<HTMLDivElement>(null)
  const fullText = [completed.trim(), text.trim()].filter(Boolean).join("\n\n")
  const showPreview = live && Boolean(fullText)
  const label = active
    ? (fullText ? tr("思考中…") : tr("正在处理任务"))
    : tr("思考过程")

  React.useLayoutEffect(() => {
    const viewport = preview.current
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [fullText, showPreview])

  React.useLayoutEffect(() => {
    const viewport = preview.current
    if (!viewport || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => { viewport.scrollTop = viewport.scrollHeight })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [showPreview])

  if (!active && !fullText) return null

  return <div className="min-w-0 text-ink-3">
    <details className="group/thought min-w-0">
      <summary
        aria-disabled={!fullText}
        onClick={event => { if (!fullText) event.preventDefault() }}
        className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-[11px] hover:text-ink-2 focus-visible:outline-accent aria-disabled:cursor-default [&::-webkit-details-marker]:hidden"
      >
        <PenTool aria-hidden className={active
          ? "size-3 shrink-0 origin-bottom-left text-accent motion-safe:animate-[thinking-pen_1.8s_ease-in-out_infinite]"
          : "size-3 shrink-0"} />
        <span aria-live="polite">{label}</span>
        {fullText && <ChevronDown aria-hidden className="size-3 shrink-0 group-open/thought:rotate-180" />}
      </summary>
      {fullText && <div
        ref={showPreview ? preview : undefined}
        className={showPreview
          ? "mt-1 max-h-[3lh] overflow-hidden whitespace-pre-wrap break-words pl-[18px] text-[12px] leading-relaxed [overflow-wrap:anywhere]"
          : "scroll-thin mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] leading-relaxed [overflow-wrap:anywhere]"}
      >
        {fullText}
      </div>}
    </details>
  </div>
}
