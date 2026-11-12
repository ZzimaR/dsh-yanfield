import type { AiStreamEvent } from "@/lib/types";

/**
 * 把 AiStreamEvent 异步生成器包装成 SSE Response。
 * 客户端断开会 abort 生成器，从而取消上游模型请求。
 */
export function sseResponse(run: (signal: AbortSignal) => AsyncGenerator<AiStreamEvent>): Response {
  const encoder = new TextEncoder();
  const controllerRef = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AiStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        for await (const event of run(controllerRef.signal)) send(event);
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "生成失败",
          code: "server",
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      }
    },
    cancel() {
      controllerRef.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export function linkedSignal(request: Request, fallback: AbortSignal): AbortSignal {
  const anySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anySignal === "function") return anySignal([request.signal, fallback]);
  return fallback;
}
