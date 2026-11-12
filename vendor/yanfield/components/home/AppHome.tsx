import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { FAQ } from "@/components/landing/FAQ";

const HELP = [
  {
    title: "打开一本书",
    detail: "进书架后打开已有的作品，或新建一本。示例《潮信》可以直接写。",
  },
  {
    title: "在章节里写",
    detail: "左边查设定，右边让 AI 帮忙。它给出的改动，要点了才会写进正文。",
  },
  {
    title: "需要时再填模型",
    detail: "左下角齿轮里可以填 API Key。不填也能用演示模型把流程走一遍。",
  },
] as const;

/** 本机打开时的首页：先给开始写作，下面是用法和常见问题。 */
export function AppHome() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:px-6 sm:py-20">
        <p className="text-[12px] tracking-[0.18em] text-ink-3">砚田</p>
        <h1 className="mt-3 font-serif text-[36px] leading-tight text-ink sm:text-[44px]">开始写吧</h1>
        <p className="mt-3 max-w-md text-[14px] leading-7 text-ink-2">稿子就在这台电脑上。打开书架，接着上次的章节写。</p>
        <Link
          href="/library"
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-accent px-6 text-[16px] font-medium text-accent-ink shadow-card transition-colors hover:bg-accent-hover"
        >
          开始写作
          <ArrowRight className="size-4" aria-hidden />
        </Link>

        <section id="help" className="mt-16">
          <h2 className="font-serif text-[22px] text-ink">使用帮助</h2>
          <ol className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {HELP.map((item, index) => (
              <li key={item.title} className="grid grid-cols-[auto_1fr] gap-x-3 px-4 py-3.5">
                <span className="font-serif text-[15px] text-accent">{index + 1}</span>
                <span>
                  <span className="block text-[14px] font-medium text-ink">{item.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-6 text-ink-3">{item.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <FAQ compact />
      </div>
    </AppShell>
  );
}
