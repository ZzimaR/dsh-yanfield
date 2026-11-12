# Pull Request

## 这个 PR 做了什么

<!-- 一段话说明目的；关联的 Issue 请写 `Closes #123`。 -->

Closes #

## 改动清单

<!-- 按文件/模块列出主要改动，方便 review。 -->

-
-

## 类型

- [ ] 🐛 Bug 修复
- [ ] ✨ 新功能
- [ ] 🎨 界面 / 样式 / 文案
- [ ] ♻️ 重构（不改变行为）
- [ ] 📝 文档 / 截图
- [ ] 🔧 构建 / 依赖
- [ ] 💥 会破坏已有数据或接口的变更（必填说明）

## 自测

- [ ] `node scripts/build.mjs` 通过
- [ ] `node scripts/check.mjs` 通过
- [ ] `node scripts/smoke.mjs` 通过
- [ ] 用 DSH CLI 装进测试 profile，启动后手动验过相关页面
- [ ] 改的是宿主端（`src/host.ts`、`vendor/yanfield/lib`、API 路由）→ 确认已重启而非只刷新
- [ ] AI 相关改动在**隔离库**（`yanfield-dev` + `config.dataDir`）里跑过，没有写用户真实书库

<!-- 贴关键输出（构建日志、探针 JSON、截图） -->

## 截图（界面类改动必填）

<!-- 前后对比更好；light 与 dark 都建议给一张。 -->

## 检查清单

- [ ] 没有提交 `dist/`、安装包、`.tmp-test/`、`data/`、`client/styles.generated.css` 或 `src/generated/`
- [ ] 没有把 Node 专用模块（`node:sqlite` / `node:fs` / `@/lib/db` 等）带进客户端 bundle
- [ ] 新文案与现有中文风格一致；README / docs 相关说明已同步（含 `docs/en/`）
- [ ] 没有隐私信息（API Key、书稿正文、个人路径）
