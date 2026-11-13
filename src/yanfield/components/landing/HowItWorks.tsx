import * as React from "react";
import { VERSION } from "./constants";
import { CodeBlock } from "./CodeBlock";
import { SectionHeading } from "./SectionHeading";

const STEPS = [
  {
    no: "01",
    title: "安装插件",
    description: "用 DSH 的插件命令装进 web 或 desktop profile。",
    note: "仓库已带构建产物，安装不会执行脚本。",
  },
  {
    no: "02",
    title: "重启 Harness",
    description: "装完后重启，侧栏才会出现砚田。",
    note: "桌面版使用 desktop profile。",
  },
  {
    no: "03",
    title: "开始写作",
    description: "打开砚田。模型用 Harness 里已经配好的服务，也可以先用离线演示。",
    note: "改动先给你看，确认后才写入。",
  },
] as const;

/** 三步把砚田装到自己的电脑上。 */
export function HowItWorks({ compact = false }: { compact?: boolean }) {
  const clone = `dsh plugin --profile web add github:ZzimaR/dsh-yanfield`;

  return (
    <section id="how" className={compact ? "py-2" : "mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24"}>
      <SectionHeading
        align={compact ? "left" : "center"}
        eyebrow="安装"
        title="三步，放进 Harness"
        description="不需要另外开一个网站。装进当前 profile 就能写。"
      />

      <ol className={compact ? "mt-6 grid gap-3" : "mt-10 grid gap-4 sm:mt-12 lg:grid-cols-3"}>
        {STEPS.map((step, index) => (
          <li key={step.no} className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface p-4 shadow-xs sm:p-5">
            <div className="flex items-baseline gap-2.5">
              <span className="font-serif text-[26px] leading-none text-accent">{step.no}</span>
              <h3 className="text-[14.5px] font-medium text-ink">{step.title}</h3>
              {index === 0 ? (
                <span className="ml-auto rounded-sm bg-accent-soft px-1.5 py-0.5 font-mono text-[9.5px] text-accent">
                  {VERSION}
                </span>
              ) : null}
            </div>
            <p className="mt-2.5 text-[12.5px] leading-6 text-ink-3">{step.description}</p>
            <div className="mt-3">
              {index === 0 ? (
                <CodeBlock label="terminal" code={clone} />
              ) : index === 1 ? (
                <CodeBlock label="terminal" code="重启 Harness" />
              ) : (
                <CodeBlock label="app" code="侧栏 → 砚田" />
              )}
            </div>
            <p className="mt-auto pt-3 text-[11px] leading-5 text-ink-3">{step.note}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
