"use client";

import * as React from "react";
import { ExternalLink, Info, ShieldCheck, Sparkles } from "lucide-react";
import { InkstoneMark } from "@/components/brand/InkstoneMark";
import { Badge, Card } from "@/components/ui/kit";
import { GITHUB_URL, DOCS_URL, ISSUES_URL, VERSION } from "@/components/landing/constants";

const STACK = ["Next.js 15", "React 19", "TypeScript", "Tailwind CSS v4", "TipTap", "SQLite (node:sqlite)", "lucide-react"];

const CREDITS = [
  { name: "Next.js / React", note: "应用框架与 UI 运行时" },
  { name: "TipTap", note: "沉浸式块级编辑器" },
  { name: "Tailwind CSS", note: "设计 token 与排版系统" },
  { name: "lucide-react", note: "图标" },
  { name: "node:sqlite", note: "零依赖本地数据库" },
  { name: "所有开源作者", note: "以及每一位愿意把故事写下去的人" },
];

export function AboutSection() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-ink">关于</h2>
        <p className="mt-1 text-[12px] leading-6 text-ink-3">砚田是一个本地优先的 AI 小说创作工作台，源码公开、可自托管。</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <InkstoneMark className="size-9" />
          <div>
            <p className="font-serif text-[15px] text-ink">砚田 Yanfield</p>
            <p className="font-mono text-[10.5px] text-ink-3">{VERSION} · 不可商用</p>
          </div>
          <Badge tone="jade">源码公开</Badge>
          <Badge tone="gold">本地优先</Badge>
        </div>
        <dl className="mt-3.5 space-y-2 border-t border-line pt-3 text-[12px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">仓库</dt>
            <dd>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-accent link-underline"
              >
                {GITHUB_URL.replace("https://", "")}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">文档</dt>
            <dd>
              <a href={DOCS_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent link-underline">
                使用与架构文档
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">问题反馈</dt>
            <dd>
              <a href={ISSUES_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent link-underline">
                GitHub Issues
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">许可证</dt>
            <dd className="text-ink-2">PolyForm Noncommercial 1.0.0 · 可自己用、修改与分享，不可商用</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <ShieldCheck className="size-3.5 text-ink-3" aria-hidden />
          你的数据属于你
        </h3>
        <p className="mt-1.5 text-[12px] leading-6 text-ink-2">
          书稿、设定与 API Key 都只保存在本机 SQLite 文件中，没有账号、没有云端同步、没有遥测。
          停服后可以整库备份或迁移到另一台电脑；数据库含明文 API Key，请勿提交到公开仓库。
        </p>
      </Card>

      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Info className="size-3.5 text-ink-3" aria-hidden />
          技术栈
        </h3>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {STACK.map((item) => (
            <span key={item} className="rounded-sm border border-line bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] text-ink-3">
              {item}
            </span>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <Sparkles className="size-3.5 text-ink-3" aria-hidden />
          致谢
        </h3>
        <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {CREDITS.map((credit) => (
            <li key={credit.name} className="text-[11.5px] text-ink-3">
              <span className="text-ink-2">{credit.name}</span>
              <span className="text-ink-3"> — {credit.note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-ink-3">
          若砚田帮你把一本书写完，欢迎回仓库点一颗星，或提交你改好的提示词。
        </p>
      </Card>
    </div>
  );
}
