# 官网

<https://yanfield.com> 的宣传站在 [`site/`](../site)，是纯静态站点：不用框架，也没有运行时依赖。`scripts/build-site.mjs` 把它构建到 `site-dist/`（已加入 .gitignore），再由 [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) 部署到 GitHub Pages。它与插件产物互不影响。

## 目录

| 路径 | 作用 |
| --- | --- |
| `site/content.mjs` | 全部文案，简体中文（`zh`）与英文（`en`）两套，结构必须一致，`check:site` 会检查。示例书稿保持原文，不翻译。 |
| `site/template.mjs` | 两个页面与 `404.html` 的 HTML |
| `site/site.css` | 样式。颜色令牌在构建时从 `src/yanfield/app/globals.css` 复制，站点不另设调色板。 |
| `site/site.js` | 主题、菜单、标签页、审阅演示、复制按钮。不开 JavaScript 页面照样可读。 |
| `site/shots.mjs` | 画廊使用哪些截图 |

中文页是 `/`，英文页是 `/en/`；语言切换是普通链接，并会记住你的选择。页面与资源之间全部使用相对链接，所以自定义域名和 `https://zzimar.github.io/dsh-yanfield/` 这样的项目路径都能用。

## 命令

```bash
npm run build:site     # 生成 site-dist/
npm run check:site     # 结构、中英文一致性、链接、元数据、令牌与动效规则
npm run preview:site   # 在 http://127.0.0.1:4173/ 预览 site-dist（可用 PORT 改端口）
```

`SITE_URL` 决定规范链接、站点地图和社交卡片使用的公开地址，默认 `https://yanfield.com/`。取其他值时会构建成 **noindex 预览**（`robots.txt` 禁止抓取），避免测试副本与正式站点争抢收录。

```bash
SITE_URL=https://zzimar.github.io/dsh-yanfield/ npm run build:site
```

## 截图

画廊使用 `docs/screenshots/` 里的真实截图，清单在 `site/shots.mjs`（中文界面：`workspace.png`、`workspace-dark.png`、`library.png`；英文界面：`en-editor.png`、`en-editor-dark.png`、`en-library.png`）。界面改动后用当前版本重新截一张 1440×900 的图，覆盖同名文件再构建即可。清单里的文件都是必需的：缺失或不是 PNG 时构建会失败。首屏是用 HTML 绘制的示意图，页面上已标明不是截图。

## 部署到 GitHub Pages

工作流在 `main` 上改动站点相关文件时运行，也可手动触发。它会构建、运行 `check:site`、上传 `site-dist/` 并部署；整体只有 `contents: read`，只有部署任务才有 `pages: write` 与 `id-token: write`。

仓库所有者需要一次性设置：**Settings → Pages → Build and deployment → Source 选 GitHub Actions**。启用之前，工作流会停在 *configure-pages* 这一步。构建地址取自 Pages 配置，所以最初几次部署是项目地址上的 noindex 预览。

## 把 yanfield.com 从旧仓库迁过来

`yanfield.com` 目前由早期独立版仓库 [ZzimaR/yanfield](https://github.com/ZzimaR/yanfield) 的 Pages 使用。一个自定义域名同一时间只能属于一个仓库，本仓库不会自动接管它；工作流也不会写入 `CNAME` 文件（使用 Actions 作为来源时，域名只在设置里配置）。

1. 在本仓库启用 Pages（来源：GitHub Actions），到 Actions 页手动运行 **Pages**。在项目地址上用中英文、两种主题检查预览。
2. 在旧仓库的 **Settings → Pages** 里移除自定义域名。从这一刻起旧站点不再响应 `yanfield.com`。
3. 在本仓库的 **Settings → Pages** 里把 **Custom domain** 设为 `yanfield.com`，等 DNS 检查通过后勾选 **Enforce HTTPS**。如果 DNS 记录已经指向 `ZzimaR` 账号的 GitHub Pages，可以保持不变。
4. 再运行一次 **Pages** 工作流。配置了自定义域名后，构建地址变为 `https://yanfield.com/`，站点会以可收录模式构建并附带站点地图。
5. 是否归档旧仓库由所有者另行决定；站点只把它当作历史链接。

需要回退时，在本仓库移除域名，再回到旧仓库重新设置。
