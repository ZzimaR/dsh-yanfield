import * as React from "react";
import { VERSION } from "./constants";
import { CodeBlock } from "./CodeBlock";
import { SectionHeading } from "./SectionHeading";

const STEPS = [
  {
    no: "01",
    title: "安装依赖",
    description: "克隆仓库并安装依赖。需要 Node.js ≥ 22.13 与 pnpm。",
    note: "没有 pnpm？先执行 npm i -g pnpm。",
  },
  {
    no: "02",
    title: "启动本地服务",
    description: "一条命令启动。首次运行会自动建库并写入内置提示词，不碰外部数据库。",
    note: "SQLite 零配置，不需要 Docker。",
  },
  {
    no: "03",
    title: "开始写作",
    description: "打开本地地址，在「设置 → 模型服务」填入你的 API Key，或先创建示例作品离线体验。",
    note: "Key 保存在自己的部署环境，调用时发送给所选服务商鉴权。",
  },
] as const;

/** 三步把砚田装到自己的电脑上。 */
export function HowItWorks({ compact = false }: { compact?: boolean }) {
  const clone = `git clone https://github.com/ZzimaR/Yanfield.git\ncd Yanfield\npnpm install`;

  return (
    <section id="how" className={compact ? "py-2" : "mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24"}>
      <SectionHeading
        align={compact ? "left" : "center"}
        eyebrow="安装"
        title="三步，放到自己的电脑上"
        description="不需要注册，也不需要数据库。能跑 Node.js 的地方就能写。"
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
                <CodeBlock label="terminal" code="pnpm dev" />
              ) : (
                <CodeBlock label="browser" code="http://127.0.0.1:3000" />
              )}
            </div>
            <p className="mt-auto pt-3 text-[11px] leading-5 text-ink-3">{step.note}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
