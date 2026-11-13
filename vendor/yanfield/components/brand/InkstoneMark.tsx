import { cn } from "@/lib/ui/cn";
import { useT } from "@/lib/i18n";

/**
 * 砚田标识。内联矢量，不请求 /logo.svg。
 * 插件跑在 Harness 里，那个路径属于宿主，不是砚田的静态文件。
 */
export function InkstoneMark({ className }: { className?: string }) {
  const tr = useT();
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={tr("砚田")} className={cn("object-contain", className)}>
      <rect x="2.5" y="2.5" width="59" height="59" rx="15" fill="#f5f1e8" stroke="#d6c9b0" strokeWidth="1.5" />
      <g fill="none" stroke="#b5462f">
        <rect x="11" y="11" width="42" height="42" rx="5" strokeWidth="2.6" />
        <path d="M32 11v42M11 32h42" strokeWidth="1.6" strokeDasharray="3 2.6" opacity="0.7" />
      </g>
      <path d="M22.5 18c1.6-1.4 4.6-.9 8 1.2 5.6 3.4 11.4 8.6 12.3 14.6.8 5.4-2.6 9.6-7.6 9.6-4.6 0-7.6-3.4-7.4-7.8.2-3.6-1-7.8-4.2-12.8-1.2-1.9-2.2-3.6-1.1-4.8Z" fill="#201d18" />
    </svg>
  );
}
