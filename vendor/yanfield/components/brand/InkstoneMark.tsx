import { cn } from "@/lib/ui/cn";

/** 砚田标识：宣纸方块上的朱红田字格与一笔墨点，矢量图，小尺寸和深色主题下都清晰。 */
export function InkstoneMark({ className }: { className?: string }) {
  return <img src="/logo.svg" alt="砚田" width={64} height={64} className={cn("object-contain", className)} />;
}
