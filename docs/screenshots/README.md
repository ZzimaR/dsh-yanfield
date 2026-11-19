# Screenshot notes / 截图说明

Screenshots in this directory are used by the READMEs and docs. The `en-*` files show the English UI; the others were captured in the Chinese UI.

| File | Content |
| --- | --- |
| `archive-window.png` | Story archive floating window in the Chinese dark theme |
| `en-chapter-outline.png` | Chapter outline coverage and pacing indicators in the English light theme |
| `en-library.png` | Bookshelf in English: book cards, covers, genres, word counts |
| `en-editor.png` | Three-column writing desk in English: contents, prose, AI panel |
| `en-editor-dark.png` | The current English writing desk in the night-sail theme |
| `en-settings.png` | Settings → Model services in English, with an example custom DSH route |
| `yanfield-in-dsh.gif` | 24-second DSH walkthrough (recorded in Chinese): shelf, desk, outline, codex, archives, context preview, reviewing and reverting an example edit, model routes |
| `dsh-workspace.jpg` | Marketplace hero image with the DSH sidebar |
| `market-icon.png` | 192×192 marketplace icon rasterized from `icon.svg` |
| `workspace.png` | Writing desk (rice-paper theme) |
| `library.png` | Bookshelf (Chinese UI) |
| `review-light.png` | Prose review: green insertions, red deletions, keep or revert per paragraph |
| `settings-models.png` | Settings → Model services in Chinese, with an example custom DSH route |
| `workspace-dark.png` | Writing desk (night-sail theme) |
| `task-card.png` | AI task card with candidate prose and field-by-field note changes |

Notes:

- 官网使用的六张截图（`workspace.png`、`workspace-dark.png`、`library.png`、`en-editor.png`、`en-editor-dark.png`、`en-library.png`）于 2026-11-17 使用当前源码构建，在隔离的 DSH 0.2.2-rc.3 示例环境中重新截取。AI 面板显示离线演示模式，不代表真实模型生成；其余图片和 GIF 尚未重新录制。
- The six website screenshots listed above were recaptured on November 17, 2026 from the current source build in an isolated DSH 0.2.2-rc.3 sample environment. The AI panel shows offline demo mode, not a live model response. Other images and the GIF have not been recaptured.
- Screenshots use an isolated sample database; manuscripts are demo content.
- The refreshed screenshots make no model requests and contain no account credentials, real manuscripts, or personal account balances.
- Static screenshots are captured at 1440×900 and cropped to the panel area.
- Regenerate static screenshots at the same size and theme, and keep them under 300 KB.
- The demo GIF is 1440×960, keeps the DSH sidebar to show the plugin entry, and includes captions.
- [`screenshots.json`](../../screenshots.json) controls the marketplace gallery and its order.
