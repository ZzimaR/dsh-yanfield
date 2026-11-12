"use client";

import * as React from "react";
import { apiGet } from "@/lib/client/api";
import type { Chapter } from "@/lib/types";

/** One body at a time; request identity also guards rapid A → B → A switches. */
export function useChapterContent(chapterId: string | null, initialChapter: Chapter | null = null) {
  const [revision, retry] = React.useReducer((n: number) => n + 1, 0);
  const request = React.useMemo(() => ({ chapterId, revision }), [chapterId, revision]);
  const [result, setResult] = React.useState<{ request: typeof request; data?: Chapter; error?: string } | null>(null);
  const seededInitialChapterIdRef = React.useRef<string | null>(null);
  const seededRequestRef = React.useRef<typeof request | null>(null);
  React.useEffect(() => {
    if (!request.chapterId) return;
    if (initialChapter?.id === request.chapterId) {
      if (seededRequestRef.current === request) return;
      if (seededInitialChapterIdRef.current !== initialChapter.id) {
        seededInitialChapterIdRef.current = initialChapter.id;
        seededRequestRef.current = request;
        setResult({ request, data: initialChapter });
        return;
      }
    }
    const controller = new AbortController();
    void apiGet<Chapter>(`/api/chapters/${request.chapterId}`, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ request, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ request, error: error instanceof Error ? error.message : "正文加载失败" });
    });
    return () => controller.abort();
  }, [request, initialChapter]);
  const current = result?.request === request ? result : null;
  return { data: current?.data, error: current?.error, refresh: retry };
}
