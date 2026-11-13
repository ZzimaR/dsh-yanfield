# 开发说明

## 一、环境

- Node.js ≥ 22.19（构建、自检用；运行时不依赖它，Harness 自带运行时）。
- 一个可用的 DeepSeek Harness 安装（`>=0.2.1-rc.5`），最好有两个 profile：
  - 一个正式用的（如 `desktop`），装稳定版本；
  - 一个开发用的（如 `yanfield-dev`），用 DSH CLI 链接本仓库，修改后重新构建。

```bash
npm ci
```

只装构建依赖（esbuild、Tailwind CLI、React 类型等）。插件发布时自带 `dist/`，安装端不会执行任何安装脚本。

## 二、常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 生成路由表 → 编译 CSS → 打包 `dist/host.js`、`dist/client.js` |
| `npm run check` | 清单自检：包名、`cordis.patch.yml`、导出、README 安装命令、产物是否存在 |
| `npm run smoke` | 冒烟测试：在临时目录起 HTTP 处理器，验证关键接口 |
| `npm run test` | 以上三者串起来 |
| `npm pack --dry-run` | 查看安装包文件清单，检查两个 `dist/` 入口和 `cordis.patch.yml` |
| `npm run reinstall -- <profile>` | 调试已有的拷贝安装，直接替换其插件目录。首次安装使用 DSH CLI |

## 三、构建链

`scripts/build.mjs` 依次做四件事：

1. **路由表**：扫描 `src/yanfield/app/api/**/route.ts`，生成 `src/generated/routes.js`（`{ 路径: { GET, POST, … } }`）。这个文件是构建产物，不入库（见 `.gitignore`）。
2. **样式**：`client/app.css` 里 `@import "tailwindcss"` + `@source` 扫描 `src/yanfield`，再 `@import "../src/yanfield/app/globals.css"`；用 `@tailwindcss/cli --minify` 输出 `client/styles.generated.css`，并追加 `EditorStatusBar.module.css`。
3. **浏览器包**：esbuild 打包 `client/index.tsx` → `dist/client.js`（CJS、`platform=browser`、React 外置、`.css` 用 text loader、banner 为 `window.__ModuleLoader__.load(...)`）。构建时间通过 `define.__YANFIELD_BUILD__` 打进包里，显示在「设置 → 关于」。
4. **宿主包**：esbuild 打包 `src/host.ts` → `dist/host.js`（ESM、node22）。

别名 `@/` 指向 `src/yanfield/`。`@/package.json` 在打包时指向仓库根清单，使安装包、API 与「关于」页共用一个版本号。

## 四、两个容易踩的坑

**1. 不要把服务端模块拖进浏览器包。**
给客户端组件导出工具函数时，注意它所在的模块 import 了什么。例如把一个用到 `repo`（`node:sqlite`）的函数放进客户端组件的 import 链，esbuild 会报 `Could not resolve "node:sqlite"`。纯函数放到不含服务端依赖的模块里（如 `lib/ai/harness-bridge.ts`）。

**2. Python 改文件要指定换行。**
用脚本批量改源码时写 `io.open(path, "w", encoding="utf-8", newline="\n")`，否则整文件变成 CRLF，diff 会炸。

## 五、本地联调

推荐做法：单独起一个实例，别碰正在用的那个。

1. 在仓库根目录构建，用 Web 模板创建开发 profile，再通过 DSH CLI 链接仓库：

   ```bash
   npm test
   dsh --profile yanfield-dev --from-default-profile web --dump-config
   dsh plugin --profile yanfield-dev add .
   ```

   `--from-default-profile` 会重建同名 profile，只在首次创建时运行。已有开发 profile 可以跳过这一行。

2. 给这个 profile 配一份隔离数据库（避免写你的真实书稿），在 `~/.dsh/profiles/yanfield-dev/cordis.patch.yml` 追加：

   ```yaml
   - id: yanfield
     config:
       dataDir: D:/dsh-yanfield/.tmp-test/dataA
   ```

   注意这里的 `id` 是包内插件 id（`yanfield`），不是包名。

3. 起实例：

   ```bash
   dsh --profile yanfield-dev --port 4761 --no-open
   ```

   日志里会打印带 token 的地址，用无头浏览器附上 token 打开即可自动化验证。

4. 后续修改运行代码时执行 `npm run build`，再重启开发实例。链接会继续使用同一份仓库，无需再次安装。

## 六、界面验证（可选）

仓库不依赖浏览器自动化，但本地可以用 Chrome 无头模式截图核对：

```bash
chrome --headless=new --no-sandbox --disable-gpu --disable-crash-reporter \
  --user-data-dir=.tmp-test/profile --hide-scrollbars \
  --window-size=1400,950 --screenshot=out.png "http://127.0.0.1:4761/?token=<token>"
```

需要交互（点击、等待流式输出）时，用 CDP 驱动更稳：连上 `/json/version` 的 `webSocketDebuggerUrl`，发 `Runtime.evaluate` 与 `Input.dispatchMouseEvent`。

## 七、发布检查清单

日常 push 和 PR 只运行 CI。版本号在 PR 里改好（不要在合并后的 `main` 上补）：

```bash
npm version patch --no-git-tag-version   # 只改 package.json 与 lockfile，不打 tag
```

PR 合并后再给合并提交打 tag：

```bash
git checkout main
git pull origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

**只有推 tag 才会触发发布**；PR 合并本身不会发包。

推送 `v*` 标签后，[发布工作流](../.github/workflows/release.yml) 会核对标签与包版本，只构建、测试并打包一次。同一个 `dsh-yanfield.tgz` 随 GitHub Release 交付，也通过 npm Trusted Publishing 发布。稳定版发布到 npm 的 `latest`，预发布版发布到 `next`。版本号按需用 `patch` / `minor` / `major`。

npm 的 Trusted Publisher 绑定 `ZzimaR/dsh-yanfield` 的 `release.yml`，并允许 `npm publish`。工作流使用 OIDC，无需仓库 Token。可在隔离 profile 安装产物验证新建作品、模型连接和 AI 审阅。

`dist/` 由构建生成，随安装包交付。开发者用本地链接调试。市场收录条目可使用 [market-entry.yml](market-entry.yml)，截图由 [screenshots.json](../screenshots.json) 提供，市场通过包清单的 `repository` 关联 npm。

## 八、目录速览

```
client/            插件半区：shadow DOM 挂载、插槽注册、样式入口
src/host.ts        宿主半区：/yanfield 路由、模型与账号桥
scripts/           build / check / smoke / reinstall
src/yanfield/
  app/             页面与 API 路由（Next 风格，插件内复用）
  components/      UI：editor / ai / library / settings / ui(kit)
  lib/             领域类型、SQLite、repo、AI provider / agent / diff
docs/              功能、AI 与费用、架构、开发、常见问题、截图
```
