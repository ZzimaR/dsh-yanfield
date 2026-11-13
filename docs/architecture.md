# 架构说明

## 一、总体形态

砚田是一个 DSH 插件包，一个包同时提供两个半区：

```
dsh-yanfield
├── dist/host.js     宿主半区（Node / ESM）：注册 /yanfield 下的 HTTP 路由，桥接 Harness 的模型与账号服务
├── dist/client.js   浏览器半区（CJS bundle）：注册左侧导航、主面板、右侧标签，接管面板渲染
├── cordis.patch.yml 让 Harness 把插件以 id=yanfield 插入组合配置
└── src/yanfield/ 写作台本体源码（React + 领域逻辑 + SQLite 访问）
```

宿主侧入口 `src/host.ts` 导出 `{ name, apply }`：

- `apply(ctx, config)` 中创建桥（`createBridge`），并把 HTTP 处理器挂到 `webServer` 的 `/yanfield` 前缀下；
- 需要 `connection`、`webServer` 服务；`llm` 通过 `ctx.inject(["llm"], …)` 延迟获取；
- `deepseekAccount` 不写进 inject —— 用 `ctx.get("deepseekAccount")` 探测，缺服务的 profile 也能起来。

浏览器侧入口 `client/index.tsx` 在 Harness 给的宿主元素上 `attachShadow({mode:"open"})`，把一份编译好的 CSS 注入 shadow root，再挂载 React 应用与 portal 容器；同时向 UI 注册四个插槽：

| 插槽 | 内容 |
| --- | --- |
| `main` | 砚田主面板（key `yanfield`） |
| `sidebar.panellist` | 左侧导航「砚田」入口 |
| `sidebarRightTabs` / `sidebar.right.pane.tab` | 右侧标签页 |

## 二、为什么用 Shadow DOM

Harness 自身也是 Tailwind 应用，全局样式、重置、`@property` 规则都很多。砚田把整棵树放进 shadow root，避免两边样式互相污染，也让「主题」变成可控的一层：

1. `styles.generated.css` 里所有设计 token 定义在 `:host, .yf-app, .yf-portal` 上；
2. 主题由 `setThemeRoots([host, mount, portal])` + `applyTheme` 写到每个根节点的 `data-theme`；
3. 宿主明暗变化通过 `MutationObserver` 监听 `document.body` 的 `data-ds-dark-theme` 属性，实时同步。

**一个已知的浏览器行为**：Chrome 不注册声明在 shadow root 里的 `@property`。Tailwind v4 的 `border-*`、`shadow-*`、`ring-*` 工具类都写成 `var(--tw-*)` 且没有回退值，因此插件会把 CSS 里的 `@property` 块整体复制到 `document.head` 注册一次（`registerAtProperties`），shadow 内的工具类才能正常取值。否则所有边框和阴影都会消失。

下拉菜单、弹窗、toast 等浮层通过 `yanfieldPortal()` 渲染到 `.yf-portal`（shadow 内的 fixed 容器）。由于它不在 `document` 顶层，浮层的定位与遮罩要用「面板宿主元素」的 `getBoundingClientRect()` 计算（`yanfieldPanelBounds()`），否则 fixed 元素会铺满整个 Harness 窗口。

Shadow DOM 还会让 `event.target` 在 document 级监听里被重定向到宿主元素，导致「点击外部关闭」把弹层内的点击误判为外部。相关组件统一改用 `event.composedPath()` 判断（`isInsideComposedPath`）。

## 三、路由与构建

`src/yanfield/app/api/**/route.ts` 是 Next.js 风格的路由文件（导出 `GET` / `POST` / `PATCH` / `DELETE`）。构建脚本 `scripts/build.mjs` 会：

1. 扫描这些文件，生成 `src/generated/routes.js`（一张 `路径 → handler` 表）；
2. 用 `@tailwindcss/cli` 把 `client/app.css`（Tailwind + 写作台的 globals.css）编译成 `client/styles.generated.css`，并追加少量 module CSS；
3. 用 esbuild 打两个包：`dist/client.js`（CJS、browser、CSS 以文本内联、注入 `__YANFIELD_BUILD__` 构建时间）与 `dist/host.js`（ESM、node22）；
4. 别名 `@/` 指向 `src/yanfield/`，供写作台和插件入口导入业务模块。

宿主半区把 `/yanfield/api/*` 映射到生成的表，并统一处理鉴权（沿用 Harness 的会话）、错误包装与 SSE 输出。

## 四、数据

SQLite，默认 `$DSH_HOME/yanfield/yanfield.db`；可用 `YANFIELD_DB_PATH` 或插件配置 `dataDir` 覆盖。

主要表：

| 表 | 内容 |
| --- | --- |
| `novels` / `volumes` / `chapters` | 作品、卷、章节（正文为 HTML） |
| `novel_outlines` / `volume_outlines` / `chapter_blueprints` | 三级大纲与章纲 |
| `characters` / `world_settings` / `foreshadows` | 资料卡 |
| `story_archives` | 故事档案（摘要、状态、变动、时间线、冲突） |
| `chat_sessions` / `chat_messages` | AI 会话与消息 |
| `agent_runs`（及 changes 载荷） | 多步任务的运行记录、候选改动与状态 |
| `providers` / `app_settings` / `prompt_presets` | 模型服务、设置、提示词预设 |
| `ai_logs` / `word_snapshots` | 用量日志、字数快照 |

数据库是唯一事实来源；前端不存草稿副本（AI 审阅状态由服务端的 run 记录恢复）。

## 五、一次 AI 改稿的流程

```
用户消息
  → POST /yanfield/api/ai/agent（SSE）
  → runAgent 决策循环（最多 12 轮）
      ├─ 读取资料（只读，按需）
      ├─ propose_changes（正文 diff / 资料补丁，落到 pending 候选）
      └─ 轮次/预算/失败次数保护
  → 前端流式渲染执行过程与候选
  → 正文区打开审阅：逐段 保留 / 还原
  → 确认 → POST /yanfield/api/ai/agent/:id/apply（服务端校验版本 + 事务写入）
  → 可撤回（op:"undo"）
```

AI 的写作请求采用「稳定资料在前、当前正文与临时任务在后」的序列化顺序，重复正文会被去掉，以提高前缀缓存命中率。

## 六、边界与约束

- 模型调用一律经宿主半区的桥（`HarnessBridge`），浏览器侧不接触凭据、不直连 DeepSeek。
- 插件不采集遥测，不上传书稿；只有你实际发起 AI 请求时，相关上下文才会发给你选择的 DeepSeek 服务。
- 不支持第三方网关；多服务商适配已在插件化时移除。
- 宿主侧改动需要重启 Harness 才生效，浏览器侧改动刷新即可（资源 URL 带内容哈希，`rev` 变化即拉新包）。
