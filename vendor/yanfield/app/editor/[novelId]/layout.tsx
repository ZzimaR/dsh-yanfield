import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "写作台",
  description: "三栏沉浸写作台：目录、正文与 AI 协作，自动保存到本地。",
};

/**
 * 编辑器专用布局：脱离书架/资料页的常规滚动容器，占满一屏高度，
 * 由页面内部自己管理三栏滚动与顶栏。
 */
export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-[100dvh] w-full overflow-hidden bg-paper">{children}</div>;
}
