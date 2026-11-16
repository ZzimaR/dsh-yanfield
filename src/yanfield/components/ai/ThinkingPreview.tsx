"use client"

import * as React from "react"
import { ChevronDown, PenTool } from "lucide-react"
import { useT } from "@/lib/i18n"

export function ThinkingPreview({ text, active = false }: { text: string; active?: boolean }) {
  const tr = useT()
  const preview = React.useRef<HTMLDivElement>(null)
  const hasText = Boolean(text.trim())
  const showPreview = active && hasText

  React.useLayoutEffect(() => {
    const viewport = preview.current
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [text, showPreview])

  React.useLayoutEffect(() => {
    const viewport = preview.current
    if (!viewport || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => { viewport.scrollTop = viewport.scrollHeight })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [showPreview])

  if (active) return (
    <div className="min-w-0 text-ink-3">
      <div role="status" className="flex items-center gap-1.5 text-[11px]">
        <PenTool aria-hidden className="size-3 shrink-0 origin-bottom-left text-accent motion-safe:animate-[thinking-pen_1.8s_ease-in-out_infinite]" />
        {hasText ? tr("思考中…") : tr("正在处理任务")}
      </div>
      {showPreview ? (
        <div ref={preview} className="mt-1 max-h-[3lh] overflow-hidden whitespace-pre-wrap break-words pl-[18px] text-[12px] leading-relaxed [overflow-wrap:anywhere]">
          {text.trimEnd()}
        </div>
      ) : null}
    </div>
  )

  if (!hasText) return null
  return (
    <details className="group/thought min-w-0 text-ink-3">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-[11px] hover:text-ink-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <PenTool aria-hidden className="size-3 shrink-0" />
        {tr("思考过程")}
        <ChevronDown aria-hidden className="size-3 shrink-0 group-open/thought:rotate-180" />
      </summary>
      <div className="scroll-thin mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] leading-relaxed [overflow-wrap:anywhere]">
        {text.trim()}
      </div>
    </details>
  )
}
