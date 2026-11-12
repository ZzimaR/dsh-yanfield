# 开发说明

## 一、环境

- Node.js ≥ 22.19（构建、自检用；运行时不依赖它，Harness 自带运行时）。
- 一个可用的 DeepSeek Harness 安装（`>=0.2.1-rc.5 <0.3.0`），最好有两个 profile：
  - 一个正式用的（如 `desktop`），装稳定版本；
  - 一个开发用的（如 `yanfield-dev`），用 `link:` 指向本仓库，改完即可生效。

```bash
npm install
```

只装构建依赖（esbuild、Tailwind CLI、React 类型等）。插件发布时自带 `dist/`，安装端不会执行任何安装脚本。

## 二、常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 生成路由表 → 编译 CSS → 打包 `dist/host.js`、`dist/client.js` |
| `npm run check` | 清单自检：包名、`cordis.patch.yml`、导出、README 安装命令、产物是否存在 |
| `npm run smoke` | 冒烟测试：在临时目录起 HTTP 处理器，验证关键接口 |
| `npm run test` | 以上三者串起来 |
| `npm run reinstall` | 构建 + 自检 + 整目录替换到 `~/.dsh/profiles/<profile>/node_modules/dsh-yanfield` |

`reinstall` 默认装到 `desktop`，也可以指定 profile：

```bash
npm run reinstall -- yanfield-dev
```

> 桌面 profile 里是**真实拷贝**（不是 symlink），所以每次改宿主代码都要 reinstall + 重启；开发 profile 用 `link:` 时，改完只需重启。

## 三、构建链

`scripts/build.mjs` 依次做四件事：

1. **路由表**：扫描 `vendor/yanfield/app/api/**/route.ts`，生成 `src/generated/routes.js`（`{ 路径: { GET, POST, … } }`）。这个文件是构建产物，不入库（见 `.gitignore`）。
2. **样式**：`client/app.css` 里 `@import "tailwindcss"` + `@source` 扫描 `vendor/yanfield`，再 `@import "../vendor/yanfield/app/globals.css"`；用 `@tailwindcss/cli --minify` 输出 `client/styles.generated.css`，并追加 `EditorStatusBar.module.css`。
3. **浏览器包**：esbuild 打包 `client/index.tsx` → `dist/client.js`（CJS、`platform=browser`、React 外置、`.css` 用 text loader、banner 为 `window.__ModuleLoader__.load(...)`）。构建时间通过 `define.__YANFIELD_BUILD__` 打进包里，显示在「设置 → 关于」。
4. **宿主包**：esbuild 打包 `src/host.ts` → `dist/host.js`（ESM、node22）。

别名 `@/` → `vendor/yanfield/`，所以 vendor 目录里的相对导入不用改。

## 四、两个容易踩的坑

**1. 不要把服务端模块拖进浏览器包。**
给客户端组件导出工具函数时，注意它所在的模块 import 了什么。例如把一个用到 `repo`（`node:sqlite`）的函数放进客户端组件的 import 链，esbuild 会报 `Could not resolve "node:sqlite"`。纯函数放到不含服务端依赖的模块里（如 `lib/ai/harness-bridge.ts`）。

**2. Python 改文件要指定换行。**
用脚本批量改源码时写 `io.open(path, "w", encoding="utf-8", newline="\n")`，否则整文件变成 CRLF，diff 会炸。

## 五、本地联调

推荐做法：单独起一个实例，别碰正在用的那个。

1. 建一个开发 profile（`~/.dsh/profiles/yanfield-dev`），把插件依赖指向本仓库：

   ```json
   { "dependencies": { "dsh-yanfield": "link:D:/dsh-yanfield" } }
   ```

2. 给这个 profile 配一份隔离数据库（避免写你的真实书稿），在 `~/.dsh/profiles/yanfield-dev/cordis.patch.yml` 追加：

   ```yaml
   - id: yanfield
     config:
       dataDir: D:/dsh-yanfield/.tmp-test/dataA
   ```

   注意这里的 `id` 是包内插件 id（`yanfield`），不是包名。

3. 起实例：

   ```bash
   "<install>/DeepSeek Harness.exe" --expose-internals "<install>/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js" \
     --profile yanfield-dev --port 4761 --no-open
   ```

   日志里会打印带 token 的地址，用无头浏览器附上 token 打开即可自动化验证。

4. 改完客户端代码：重新 `build` 后刷新页面（资源带内容哈希）；改完宿主代码：重启实例。

## 六、界面验证（可选）

仓库不依赖浏览器自动化，但本地可以用 Chrome 无头模式截图核对：

```bash
chrome --headless=new --no-sandbox --disable-gpu --disable-crash-reporter \
  --user-data-dir=.tmp-test/profile --hide-scrollbars \
  --window-size=1400,950 --screenshot=out.png "http://127.0.0.1:4761/?token=<token>"
```

需要交互（点击、等待流式输出）时，用 CDP 驱动更稳：连上 `/json/version` 的 `webSocketDebuggerUrl`，发 `Runtime.evaluate` 与 `Input.dispatchMouseEvent`。

## 七、发布检查清单

1. `npm run test` 全绿；
2. `npm run build` 后 `dist/` 有更新，且 `client/styles.generated.css` 已重新生成；
3. `README.md` 的安装命令与 `package.json` 的 `name`、`dsh` 字段一致；
4. 版本号（`package.json`）与「关于」页显示一致；
5. 装到干净 profile 试一次：安装 → 重启 → 新建作品 → 发一条消息 → 审阅并应用；
6. 提交时把 `dist/` 一起提交（安装端不跑构建）。

## 八、目录速览

```
client/            插件半区：shadow DOM 挂载、插槽注册、样式入口
src/host.ts        宿主半区：/yanfield 路由、模型与账号桥
scripts/           build / check / smoke / reinstall
vendor/yanfield/
  app/             页面与 API 路由（Next 风格，插件内复用）
  components/      UI：editor / ai / library / settings / ui(kit)
  lib/             领域类型、SQLite、repo、AI provider / agent / diff
docs/              功能、AI 与费用、架构、开发、常见问题、截图
```
