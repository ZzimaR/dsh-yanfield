"use client";

import * as React from "react";
import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/ui/cn";

/** 放在 <Link> 内部：导航进行中时把图标换成转圈。 */
export function LinkPendingIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return <>{children}</>;
  return <LoaderCircle className={cn("animate-spin", className)} aria-label="正在打开" />;
}
