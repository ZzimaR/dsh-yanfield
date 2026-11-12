"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export interface CodeBlockProps {
  code: string;
  label?: string;
  className?: string;
}

/** 带复制按钮的命令代码块（落地页快速开始使用）。 */
export function CodeBlock({ code, label, className }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [code]);

  return (
    <div className={cn("min-w-0 overflow-hidden rounded-md border border-line bg-surface-2/70", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line/80 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">{label ?? "terminal"}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10.5px] text-ink-3 transition-colors hover:bg-surface hover:text-ink"
          aria-label={copied ? "已复制" : "复制命令"}
        >
          {copied ? <Check className="size-3 text-jade" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="scroll-thin overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-6 text-ink-2">
        <code>
          {code.split("\n").map((line, index) => (
            <span key={index} className="block whitespace-pre">
              <span className="mr-2 select-none text-ink-3">$</span>
              {line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
