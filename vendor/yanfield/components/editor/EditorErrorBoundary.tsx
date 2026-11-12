"use client";

import * as React from "react";
import { Button } from "@/components/ui/kit";

interface EditorErrorBoundaryProps {
  children: React.ReactNode;
  /** 变化时自动重置错误状态（例如切换章节、重建面板） */
  resetKey?: string;
  /** 降级区称呼，默认按 AI 面板措辞 */
  title?: string;
}

interface EditorErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * 局部错误边界：把「右侧 AI 面板」之类的可插拔区域隔离起来。
 * 任何一处渲染异常只降级这一块，不会白屏整个写作台。
 */
export class EditorErrorBoundary extends React.Component<EditorErrorBoundaryProps, EditorErrorBoundaryState> {
  state: EditorErrorBoundaryState = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): EditorErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error("[editor] 局部面板渲染失败：", error, info.componentStack);
  }

  componentDidUpdate(previous: EditorErrorBoundaryProps): void {
    const { resetKey } = this.props;
    if (this.state.hasError && previous.resetKey !== resetKey) {
      this.setState({ hasError: false, message: "" });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, message: "" });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    const name = this.props.title ?? "AI 面板";
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-[13px] font-medium text-ink">{name}渲染出错</span>
        <p className="max-w-[240px] text-[12px] leading-relaxed text-ink-3">
          已隔离故障，正文写作与保存不受影响。
        </p>
        {this.state.message ? (
          <p className="max-w-[240px] break-words rounded-sm bg-surface-2 px-2 py-1 text-[11px] text-ink-4">
            {this.state.message}
          </p>
        ) : null}
        <Button variant="secondary" size="sm" onClick={this.handleRetry}>
          重新加载{name}
        </Button>
      </div>
    );
  }
}
