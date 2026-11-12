"use client";

import * as React from "react";
import { AlignLeft, PenLine } from "lucide-react";
import { Card } from "@/components/ui/kit";
import type { EditorLayoutSettings } from "@/lib/editor/settings";
import { cn } from "@/lib/ui/cn";

const SAMPLE_PARAGRAPHS = [
  "夜雨落在长街尽头，灯影被风吹得忽明忽暗。她握紧伞柄，听见身后传来极轻的脚步声，却没有回头。",
  "“你迟到了。”少年站在檐下，雨水顺着他的剑鞘滑落，在青石板上碎成细小的光。",
  "周晚把那封没有落款的信按在账本上。封皮还是潮的，收件人的名字却已经淡了一半。",
];

export interface EditorPreviewProps {
  fontSize: number;
  lineHeight: number;
  proseFont: "serif" | "sans";
  firstLineIndent: boolean;
  layout: EditorLayoutSettings;
}

/** 编辑器设置的实时预览：按当前字号 / 行高 / 字重 / 留白渲染，改完立即可见。 */
export function EditorPreview({ fontSize, lineHeight, proseFont, firstLineIndent, layout }: EditorPreviewProps) {
  const pageStyle = {
    maxWidth: layout.maxContentWidth > 0 ? `${layout.maxContentWidth}px` : "100%",
    padding: `${layout.pagePaddingY}px ${layout.pagePaddingX}px`,
  } as React.CSSProperties;

  const proseStyle = {
    "--prose-size": `${fontSize}px`,
    "--prose-leading": String(lineHeight),
    "--prose-indent": firstLineIndent ? "2em" : "0",
    fontSize: `${fontSize}px`,
    lineHeight,
    letterSpacing: `${layout.editorLetterSpacing}em`,
    fontWeight: layout.editorFontWeight,
  } as React.CSSProperties;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <PenLine className="size-3.5 text-ink-3" aria-hidden />
          实时预览
        </h3>
        <p className="mt-1 text-[11px] leading-5 text-ink-3">按当前字号、行高、字重与页面留白渲染，改完立即可见。</p>
        <div className="mt-3 overflow-hidden rounded-lg border border-line bg-surface-2/50 p-2.5">
          <div
            className={cn(
              "prose-paper mx-auto rounded-md border border-line bg-paper-texture shadow-xs",
              proseFont === "sans" && "font-ui",
              layout.motionEnabled && "transition-all duration-200",
            )}
            style={{ ...pageStyle, ...proseStyle }}
          >
            <h2 className="font-serif text-[17px] text-ink">示例章节</h2>
            <p className="mt-1 font-ui text-[10.5px] text-ink-3">以下为示例文本，用于预览字号与排版。</p>
            {SAMPLE_PARAGRAPHS.map((paragraph, index) => (
              <p
                key={index}
                style={{
                  marginBottom: index === SAMPLE_PARAGRAPHS.length - 1 ? 0 : `${layout.paragraphSpacing}px`,
                }}
              >
                {paragraph}
              </p>
            ))}
            {layout.showInlineHints ? (
              <div className="mt-3 flex items-center gap-1.5 rounded-sm border-l-2 border-line bg-surface-2/60 px-2 py-1.5 font-ui text-[10.5px] text-ink-3">
                <AlignLeft className="size-3 shrink-0 text-ink-4" aria-hidden />
                AI 建议（示例）· 第 2 段：可以把「碎成细小的光」换成更慢的动势
              </div>
            ) : null}
            {layout.showStatusBar ? (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line px-1 pt-2 font-ui text-[10.5px] text-ink-3">
                <span>第 2 章 · 1,842 字</span>
                <span>已自动保存</span>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-[13px] font-medium text-ink">当前排版</h3>
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-3">字号</dt>
            <dd className="font-mono text-ink-2">{fontSize}px</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-3">行高</dt>
            <dd className="font-mono text-ink-2">{lineHeight.toFixed(2)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-3">字重</dt>
            <dd className="font-mono text-ink-2">{layout.editorFontWeight}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-3">字间距</dt>
            <dd className="font-mono text-ink-2">{Number(layout.editorLetterSpacing.toFixed(3))}em</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-3">段落间距</dt>
            <dd className="font-mono text-ink-2">{layout.paragraphSpacing}px</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-3">页边距</dt>
            <dd className="font-mono text-ink-2">
              {layout.pagePaddingX} / {layout.pagePaddingY}px
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-3">最大行宽</dt>
            <dd className="font-mono text-ink-2">
              {layout.maxContentWidth === 0 ? "自适应" : `${layout.maxContentWidth}px`}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-3">首行缩进</dt>
            <dd className="font-mono text-ink-2">{firstLineIndent ? "开" : "关"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
