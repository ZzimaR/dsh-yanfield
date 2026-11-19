// Copy for the public site. Strings may contain trusted inline HTML (em, code, kbd, a, b, strong).
// Manuscript text (demoParas, sampleBook) is author content and is deliberately not translated.

export const links = {
  repo: "https://github.com/ZzimaR/dsh-yanfield",
  issues: "https://github.com/ZzimaR/dsh-yanfield/issues/new/choose",
  releases: "https://github.com/ZzimaR/dsh-yanfield/releases/latest",
  npm: "https://www.npmjs.com/package/dsh-yanfield",
  license: "https://github.com/ZzimaR/dsh-yanfield/blob/main/LICENSE",
  legacy: "https://github.com/ZzimaR/yanfield",
  docs: {
    zh: {
      features: "https://github.com/ZzimaR/dsh-yanfield/blob/main/docs/features.md",
      ai: "https://github.com/ZzimaR/dsh-yanfield/blob/main/docs/ai-and-cost.md",
      faq: "https://github.com/ZzimaR/dsh-yanfield/blob/main/docs/faq.md",
    },
    en: {
      features: "https://github.com/ZzimaR/dsh-yanfield/blob/main/docs/en/features.md",
      ai: "https://github.com/ZzimaR/dsh-yanfield/blob/main/docs/en/ai-and-cost.md",
      faq: "https://github.com/ZzimaR/dsh-yanfield/blob/main/docs/en/faq.md",
    },
  },
}

export const commands = {
  web: "dsh plugin --profile web add dsh-yanfield",
  desktop: "dsh plugin --profile desktop add dsh-yanfield",
}

export const sampleBook = {
  title: "潮信",
  volumes: [
    { name: "第一卷 · 退潮", chapters: ["第一章 空信", "第二章 税册", "第三章 纸船"] },
    { name: "第二卷 · 对岸", chapters: ["第四章 旧码头", "第五章 回程"] },
  ],
}

// [kind, text]; kind: s = unchanged, d = deleted, i = inserted
export const demoParas = [
  [
    ["s", "退潮比账本上记的早了两刻。水停在倒数第三级，最下一级露出来，泥里嵌着"],
    ["d", "船底蹭下的"],
    ["i", "半截船底蹭下的、还带着桐油味的"],
    ["s", "碎木屑。"],
  ],
  [
    ["s", "周晚把油布账本摊在石阶上，"],
    ["d", "数了数刚冒出来的信。三封。"],
    ["i", "把刚冒出来的信一封封数过去。三封，封皮都潮了，字还清楚。"],
  ],
  [
    ["s", "他盯着收件人栏里自己的名字看了一会儿，"],
    ["d", "把那封信翻过去，先登记前两封。"],
    ["i", "指腹在墨迹上停了停，终于还是把它翻了过去，先登记前两封。"],
  ],
]

// Which real screenshots the site shows is configured in site/shots.mjs.
export const shotIds = ["desk", "shelf", "outline", "archive", "models"]

export const pages = {
  zh: {
    lang: "zh-Hans",
    htmlLang: "zh-CN",
    ogLocale: "zh_CN",
    title: "砚田 Yanfield — DeepSeek Harness 里的长篇小说写作台",
    description:
      "砚田是 DeepSeek Harness 插件：三栏写作台、大纲与设定、本地 SQLite 书稿；AI 的正文改动由你逐段审阅，确认后才写入。",
    ogAlt: "砚田写作台",
    skip: "跳到正文",
    brandLabel: "砚田 Yanfield 首页",
    nav: [
      ["desk", "写作台"],
      ["review", "审阅"],
      ["notes", "资料"],
      ["models", "模型"],
      ["install", "安装"],
      ["faq", "常见问题"],
    ],
    navLabel: "主导航",
    menu: { open: "打开菜单", close: "关闭菜单", text: "菜单" },
    langSwitch: { label: "Switch to English", text: "EN" },
    theme: { toNight: "切换到夜航主题", toPaper: "切换到宣纸主题" },
    hero: {
      eyebrow: "DeepSeek Harness 插件",
      title: "长篇，<span class=\"nw\">值得一张</span><em>好书桌</em>。",
      lede:
        "砚田把长篇写作台装进 Harness 的侧栏：正文、大纲、设定与 AI 助手在同一张书桌上。书稿留在本地，模型用你已配好的 DeepSeek，AI 的每一处改动都由你逐段审阅。",
      install: "安装插件",
      github: "在 GitHub 查看",
      facts: [
        ["需要", "DSH ≥ 0.2.1-rc.5"],
        ["书稿", "本地 SQLite"],
        ["许可", "PolyForm Noncommercial"],
      ],
    },
    preview: {
      label: "示意预览",
      note: "用 HTML 绘制的示意图，不是截图，也没有连接 AI。可以点「保留 / 还原」试试。",
      region: "砚田写作台示意预览",
      tabs: ["目录", "章纲", "设定", "档案"],
      words: "字",
      assistant: "写作助手",
      request: "把这一段改得更有画面感",
      pending: "待确认改动",
      keep: "保留",
      revert: "还原",
      kept: "已保留修订",
      reverted: "已还原为原文",
      saved: "已保存",
    },
    principles: {
      label: "三件事",
      items: [
        {
          title: "住在 Harness 里",
          body: "安装后侧栏多出一个「砚田」入口，写作台直接在面板里打开。它是插件，不是独立应用；模型走 Harness 里已经配好的 DeepSeek，没有第二个 Key 要管。",
        },
        {
          title: "书稿留在本地",
          body: "作品、笔记与对话都存在本机的 SQLite 文件里，可以导出备份。卸载插件不会删除你的书稿。",
        },
        {
          title: "AI 提议，作者做主",
          body: "正文改动逐段对比，保留还是还原由你决定；确认之后，才有内容写进书稿。",
        },
      ],
    },
    desk: {
      no: "01",
      kicker: "写作台",
      title: "目录、正文、助手，并排在一张桌上",
      lede:
        "作品 / 卷 / 章三级结构，自动保存与字数统计，专注模式与可调排版，宣纸、夜航两套主题。资料随写随查，不必离开正文。",
      tabsLabel: "界面截图",
      shots: {
        desk: ["写作台", "三栏写作台：左边目录与资料，中间正文，右边 AI 助手。"],
        shelf: ["书架", "书架：封面色、题材与字数一目了然。"],
        outline: ["章纲", "章纲：覆盖度与节奏提示。"],
        archive: ["故事档案", "故事档案：章节摘要、角色状态、设定变化、时间线与未解决的冲突。"],
        models: ["模型服务", "模型服务：按 DSH 路线分组。"],
      },
      shotNote: "截图中的书稿是中文示例作品。",
      facts: [
        ["自动保存", "保存延迟可调，也可手动保存；字数、段落与阅读时长实时统计。"],
        ["专注与排版", "专注模式、打字机模式；字体、字号、行距、页边距与行宽都能调。"],
        ["快捷键", "<kbd>Alt</kbd> + <kbd>1</kbd> 折叠目录，<kbd>Alt</kbd> + <kbd>J</kbd> 聚焦 AI 输入框，<kbd>Ctrl / ⌘</kbd> + <kbd>K</kbd> 快速跳转。"],
      ],
      language:
        "界面跟随 DSH 的语言设置，中英文都完整。书稿内容不会被翻译，AI 用你写作的语言回复。",
    },
    review: {
      no: "02",
      kicker: "审阅",
      title: "AI 提议，你来定稿",
      lede:
        "助手读资料、分步执行，把正文改动整理成候选稿：绿色是新增，红色划线是删除。每一段都可以保留或还原，确认审阅结果之后，只有保留的段落会写进书稿，其余保持原文。",
      demoBadge: "演示",
      demoNote: "预置示例改动，没有连接任何 AI，也不会写入任何书稿。",
      requestLabel: "示例请求",
      request: "把第一章前几段改得更有画面感，只改这几段",
      draftTitle: "审阅修订",
      paraLabel: "文字修订",
      paraWord: "第 {n} 段",
      keep: "保留",
      revert: "还原",
      keepAll: "全部保留",
      revertAll: "全部还原",
      reset: "重置演示",
      confirm: "确认审阅结果",
      count: "{n} / {total} 已审阅",
      legendAdd: "新增",
      legendDel: "删除（划线）",
      outTitle: "确认后的书稿",
      outHint: "实时预览：保留的段落采用修订稿，其余保持原文。",
      tagKept: "已保留",
      tagReverted: "已还原 · 原文",
      tagPending: "未审阅 · 原文",
      confirmed: "演示完成：右侧就是按你的选择会写入的结果。这是示例，什么都没有被写入。",
      manuscriptNote: "示例书稿为中文，与应用内置示例作品一致；新建作品可以用任何语言写作。",
      noJs: "启用 JavaScript 后可以逐段试用「保留 / 还原」。下面是候选稿的对比：绿色为新增，红色划线为删除。",
    },
    notes: {
      no: "03",
      kicker: "资料",
      title: "设定随写随查，AI 只看你允许它看的",
      lede:
        "章纲、角色、设定、伏笔和故事档案都放在左栏，浮窗就地编辑。AI 通过 <kbd>@</kbd> 引用或自己检索读取它们，再据此提出改动。",
      items: [
        ["章纲", "作品 / 卷 / 章三级：目标、冲突、场景节拍与钩子。"],
        ["角色卡", "人物资料与状态，随章节推进更新。"],
        ["世界设定", "地点、规则、势力，需要时一键引用。"],
        ["伏笔", "埋下与回收的位置，不再靠记忆。"],
        ["故事档案", "章节摘要、角色状态、设定变化、时间线、未解决的冲突。"],
      ],
      aside: [
        ["按揭晓章节隐藏", "设定在「揭晓章」之前对 AI 不可见；关掉「AI 可见」后，连显式 @ 引用也读不到。"],
        ["上下文看得见", "引用的资料按段落预览，并显示上下文预算，发送前心里有数。"],
        ["导入与导出", "TXT 导入会识别章节标题并先预览；可导出 Markdown / TXT。"],
      ],
    },
    models: {
      no: "04",
      kicker: "模型与费用",
      title: "沿用 Harness 里的模型服务",
      lede:
        "砚田不自带账号体系，也不要求你再填一遍 Key：模型来自 Harness 已配置的服务，砚田的「模型服务」和写作助手里都能选。",
      tableLabel: "模型来源",
      head: ["来源", "需要什么", "说明"],
      rows: [
        ["DSH 账号登录", "在 Harness 内登录 DeepSeek", "推荐，无需额外设置，可查看余额"],
        ["官方 API Key", "<code>DEEPSEEK_API_KEY</code>", "按 token 计费；也可存在 Harness 的模型页"],
        ["自定义 DSH 模型", "在 DSH 的设置 → 模型 里配置接口", "可接入 LM Studio、vLLM、llama.cpp"],
        ["离线演示", "无", "只有模板文字，用来试界面，不能真正改稿"],
      ],
      cost:
        "页脚显示的是<strong>今天</strong>的累计估算，不是单次任务；单价来自内置的 DeepSeek 价目表，并按北京时间区分高峰与非高峰。<strong>仅为估算，以 DeepSeek 账单为准。</strong>",
      more: "接入细节见",
      moreLink: "AI 与费用",
    },
    install: {
      no: "05",
      kicker: "安装",
      title: "一条命令，重启一次",
      lede: "需要 DeepSeek Harness <code>&gt;=0.2.1-rc.5</code>。按你启动的 profile 选择命令，安装 npm 上的预构建包。",
      tabsLabel: "选择 profile",
      tabs: { web: "Web 版", desktop: "桌面版" },
      copy: "复制命令",
      copied: "已复制",
      copyFailed: "复制失败：请手动选中命令，再按 Ctrl / ⌘ + C。",
      steps: [
        ["安装", "在终端运行上面的命令。"],
        ["完全重启 Harness", "完全退出再重新打开。只刷新页面不够，因为插件包含宿主侧代码。"],
        ["确认", "左侧导航出现「砚田」；在 砚田 → 设置 → 关于 里核对版本。"],
      ],
      update:
        "更新：用同一个 profile 运行 <code>dsh plugin --profile &lt;profile&gt; add dsh-yanfield@latest</code> 并重启 Harness。离线安装可从 <a href=\"{releases}\">GitHub Releases</a> 下载安装包。",
      wip: "砚田仍在打磨中，界面与行为会继续调整。遇到问题欢迎到 <a href=\"{issues}\">Issues</a> 反馈。",
    },
    data: {
      no: "06",
      kicker: "数据与许可",
      title: "书稿是你的，许可写在明处",
      items: [
        [
          "本地数据库",
          "书稿存放在 <code>$DSH_HOME/yanfield/yanfield.db</code>。「设置 → 数据」可以查看真实路径、导出 <code>.yanfield</code> 备份，也能导入或恢复。卸载插件不会删除它。",
        ],
        [
          "许可",
          "采用 <a href=\"{license}\">PolyForm Noncommercial 1.0.0</a>：源码公开，可以自由使用、学习、修改与分享，但不得商用——它不是不受限制的开源许可。用它写的小说归作者所有。",
        ],
      ],
    },
    faq: {
      no: "07",
      kicker: "常见问题",
      title: "你可能想先问",
      items: [
        ["砚田是独立应用吗？", "不是。它是 DeepSeek Harness 的插件，装好并重启 Harness 后，侧栏会出现「砚田」入口。"],
        ["需要再填一个 API Key 吗？", "不需要为砚田单独填。模型来自 Harness 里已经配置的服务（DSH 账号、官方 API Key 或自定义模型），在砚田里直接选用。"],
        ["AI 会不经我同意就改稿吗？", "不会。正文改动以候选稿的形式逐段展示，你保留或还原后点「确认审阅结果」，才会写入保留的段落；资料改动在任务卡里逐项确认。"],
        ["我的书稿存在哪里？", "本机 SQLite 数据库，默认在 <code>$DSH_HOME/yanfield/yanfield.db</code>。可以在设置里导出备份；卸载插件不会删除它。"],
        ["能用英文写作吗？", "能。界面跟随 DSH 的语言设置，中英文都完整；AI 用你写作的语言回复。内置的示例作品是中文的，新建作品即可用英文写。"],
        ["可以商用吗？", "不可以。许可是 PolyForm Noncommercial 1.0.0，禁止商业使用；用它写出的小说归作者所有。"],
        ["以前那个独立的砚田呢？", "项目现在以 DSH 插件的形式继续。早先的独立版仓库仅作历史参考：<a href=\"{legacy}\">ZzimaR/yanfield</a>。"],
      ],
    },
    footer: {
      tagline: "DeepSeek Harness 里的长篇写作台。",
      madeBy: "砚田是 ZzimaR 为 DeepSeek Harness 开发的插件。",
      groups: [
        { title: "项目", links: [["GitHub 仓库", "repo"], ["发布版本", "releases"], ["npm 包", "npm"], ["反馈问题", "issues"]] },
        { title: "文档", links: [["功能说明", "docs.features"], ["AI 与费用", "docs.ai"], ["常见问题", "docs.faq"], ["许可", "license"]] },
        { title: "历史", links: [["早期独立版仓库（仅供参考）", "legacy"]] },
      ],
      top: "回到顶部",
    },
    ext: "（在新窗口打开）",
    notFound: {
      title: "页面不存在 · 砚田 Yanfield",
      heading: "这一页还没写。",
      body: "你要找的页面不存在，或者已经搬走。",
      home: "回到首页",
      other: "English",
    },
  },

  en: {
    lang: "en",
    htmlLang: "en",
    ogLocale: "en_US",
    title: "Yanfield — a long-form fiction writing desk for DeepSeek Harness",
    description:
      "Yanfield is a DeepSeek Harness plugin: a three-column writing desk, outlines and story notes, a local SQLite manuscript, and AI edits you review paragraph by paragraph before anything is written.",
    ogAlt: "Yanfield writing desk",
    skip: "Skip to content",
    brandLabel: "Yanfield home",
    nav: [
      ["desk", "Desk"],
      ["review", "Review"],
      ["notes", "Notes"],
      ["models", "Models"],
      ["install", "Install"],
      ["faq", "FAQ"],
    ],
    navLabel: "Main navigation",
    menu: { open: "Open menu", close: "Close menu", text: "Menu" },
    langSwitch: { label: "切换到中文", text: "中文" },
    theme: { toNight: "Switch to the night theme", toPaper: "Switch to the paper theme" },
    hero: {
      eyebrow: "A DeepSeek Harness plugin",
      title: "A proper desk for the <em>long novel</em>.",
      lede:
        "Yanfield puts a long-form writing desk in the Harness sidebar: manuscript, outline, story notes and an AI assistant on one desk. Your book stays local, the model is the DeepSeek you already configured, and you review every AI edit before it is written.",
      install: "Install the plugin",
      github: "View on GitHub",
      facts: [
        ["Requires", "DSH ≥ 0.2.1-rc.5"],
        ["Manuscript", "Local SQLite"],
        ["License", "PolyForm Noncommercial"],
      ],
    },
    preview: {
      label: "Illustrative preview",
      note: "Drawn in HTML: not a screenshot, and no AI is connected. Try Keep / Revert.",
      region: "Illustrative preview of the Yanfield writing desk",
      tabs: ["Contents", "Outline", "Codex", "Archive"],
      words: "words",
      assistant: "Writing Assistant",
      request: "Make this paragraph more vivid",
      pending: "Changes awaiting review",
      keep: "Keep",
      revert: "Revert",
      kept: "Revision kept",
      reverted: "Reverted to the original",
      saved: "Saved",
    },
    principles: {
      label: "Three things",
      items: [
        {
          title: "Lives inside Harness",
          body: "After installing, a Yanfield entry appears in the sidebar and the desk opens right in the panel. It is a plugin, not a standalone app; the model comes from the DeepSeek you already configured in Harness, so there is no second API key to manage.",
        },
        {
          title: "Your book stays local",
          body: "Manuscripts, notes and conversations live in a local SQLite file, and you can export backups. Removing the plugin does not delete your manuscript.",
        },
        {
          title: "AI proposes, you decide",
          body: "Prose changes are compared paragraph by paragraph. You keep or revert each one, and only then is anything written into the manuscript.",
        },
      ],
    },
    desk: {
      no: "01",
      kicker: "The desk",
      title: "Chapters, prose and assistant, side by side",
      lede:
        "A book / volume / chapter tree, autosave with live word counts, focus mode and adjustable typography, in two themes: rice paper and night sail. Notes sit within reach, so you never leave the page.",
      tabsLabel: "Interface screenshots",
      shots: {
        desk: ["Desk", "The three-column desk: contents and notes on the left, prose in the middle, the AI assistant on the right."],
        shelf: ["Shelf", "The shelf: cover colors, genres and word counts at a glance."],
        outline: ["Outline", "Chapter outline with coverage and pacing indicators."],
        archive: ["Story archive", "Story archive: chapter summaries, character states, setting changes, timeline and unresolved conflicts."],
        models: ["Models", "Model services, grouped by DSH route."],
      },
      shotNote: "The manuscripts in the screenshots are Chinese sample books.",
      facts: [
        ["Autosave", "Adjustable delay or manual save, with live word, paragraph and reading-time stats."],
        ["Focus and type", "Focus and typewriter modes; font, size, line height, margins and line width are all adjustable."],
        ["Shortcuts", "<kbd>Alt</kbd> + <kbd>1</kbd> collapses the outline, <kbd>Alt</kbd> + <kbd>J</kbd> focuses the AI box, <kbd>Ctrl / ⌘</kbd> + <kbd>K</kbd> jumps anywhere."],
      ],
      language:
        "The interface follows the Harness language setting, in English and Chinese. Manuscripts are never translated, and the AI replies in the language you write in.",
    },
    review: {
      no: "02",
      kicker: "Review",
      title: "The AI proposes. You decide.",
      lede:
        "The assistant reads your notes, works in steps, and prepares prose changes as a candidate draft: green for insertions, red strike-through for deletions. Keep or revert each paragraph; after you confirm, only what you kept is written into the manuscript and the rest stays as it was.",
      demoBadge: "Demo",
      demoNote: "A preset sample edit. No AI is connected and nothing is written to any manuscript.",
      requestLabel: "Example request",
      request: "Make the first few paragraphs of chapter one more vivid, and change only those",
      draftTitle: "Review changes",
      paraLabel: "Prose edit",
      paraWord: "paragraph {n}",
      keep: "Keep",
      revert: "Revert",
      keepAll: "Keep all",
      revertAll: "Revert all",
      reset: "Reset demo",
      confirm: "Confirm review",
      count: "{n} / {total} reviewed",
      legendAdd: "Added",
      legendDel: "Deleted (strike-through)",
      outTitle: "Manuscript after confirming",
      outHint: "Live preview: kept paragraphs use the revision; the rest stay as the original.",
      tagKept: "Kept",
      tagReverted: "Reverted · original",
      tagPending: "Not reviewed · original",
      confirmed: "Demo complete: the text on the right is what would be written for your choices. It is only an example, so nothing was written.",
      manuscriptNote: "The sample manuscript is Chinese, like the sample books bundled with the app; a new book can be written in any language.",
      noJs: "Enable JavaScript to try Keep / Revert paragraph by paragraph. Below is the candidate draft: green is added, red strike-through is deleted.",
    },
    notes: {
      no: "03",
      kicker: "Notes",
      title: "Notes within reach. The AI sees only what you allow.",
      lede:
        "Blueprints, characters, world settings, foreshadowing and story archives live in the left rail and open in place. The assistant reads them through <kbd>@</kbd> references or by searching, then proposes changes based on them.",
      items: [
        ["Outline", "Book / volume / chapter blueprints: goal, conflict, scene beats and hooks."],
        ["Characters", "Cards and states that follow the story as chapters advance."],
        ["World", "Places, rules and factions, referenced in one step when needed."],
        ["Foreshadowing", "Where a thread was planted and where it pays off."],
        ["Story archive", "Chapter summaries, character states, setting changes, timeline and unresolved conflicts."],
      ],
      aside: [
        ["Hidden until revealed", "Settings stay hidden from the AI until their reveal chapter; turning off “AI visibility” hides them even from explicit @ references."],
        ["Context you can see", "Referenced material is previewed section by section with a context budget, before you send."],
        ["Import and export", "TXT import detects chapter titles and previews first; export to Markdown or TXT."],
      ],
    },
    models: {
      no: "04",
      kicker: "Models and cost",
      title: "Uses the model services already in Harness",
      lede:
        "Yanfield has no account system of its own and does not ask for a second key: models come from the services configured in Harness, and you pick one in Model services or in the writing assistant.",
      tableLabel: "Model routes",
      head: ["Route", "What you need", "Notes"],
      rows: [
        ["DSH account sign-in", "Signed in to DeepSeek inside Harness", "Recommended, zero setup, balance readable"],
        ["Official API key", "<code>DEEPSEEK_API_KEY</code>", "Pay per token; can also be stored on Harness’ model page"],
        ["Custom DSH model", "Configure the API under Settings → Models in DSH", "Connects to LM Studio, vLLM or llama.cpp"],
        ["Offline demo", "Nothing", "Template text only, for trying the UI; cannot really edit"],
      ],
      cost:
        "The footer shows <strong>today’s</strong> cumulative estimate, not a single task. Unit prices come from a built-in DeepSeek price table and switch between peak and off-peak by Beijing time. <strong>Estimates only — the DeepSeek bill is authoritative.</strong>",
      more: "Setup details are in",
      moreLink: "AI and cost",
    },
    install: {
      no: "05",
      kicker: "Install",
      title: "One command, one restart",
      lede: "Requires DeepSeek Harness <code>&gt;=0.2.1-rc.5</code>. Choose the command for your profile to install the prebuilt package from npm.",
      tabsLabel: "Choose a profile",
      tabs: { web: "Web", desktop: "Desktop" },
      copy: "Copy command",
      copied: "Copied",
      copyFailed: "Copy failed: select the command and press Ctrl / ⌘ + C.",
      steps: [
        ["Install", "Run the command above in a terminal."],
        ["Restart Harness completely", "Quit Harness completely and start it again. A page refresh is not enough, because the plugin ships host-side code."],
        ["Confirm", "A Yanfield entry appears in the left sidebar; check the version in Yanfield → Settings → About."],
      ],
      update:
        "To update, run <code>dsh plugin --profile &lt;profile&gt; add dsh-yanfield@latest</code> in the same profile and restart Harness. For offline installs, download the package from <a href=\"{releases}\">GitHub Releases</a>.",
      wip: "Yanfield is still being polished; UI and behavior will keep changing. Bugs and ideas are welcome in <a href=\"{issues}\">Issues</a>.",
    },
    data: {
      no: "06",
      kicker: "Data and license",
      title: "The book is yours, and the license is plain",
      items: [
        [
          "Local database",
          "Manuscripts live in <code>$DSH_HOME/yanfield/yanfield.db</code>. <b>Settings → Data</b> shows the real path, exports <code>.yanfield</code> backups, and imports or restores them. Removing the plugin does not delete it.",
        ],
        [
          "License",
          "Source-available under <a href=\"{license}\">PolyForm Noncommercial 1.0.0</a>: use, study, modify and share freely, but no commercial use. It is not an unrestricted open-source license. Novels written with it belong to their author.",
        ],
      ],
    },
    faq: {
      no: "07",
      kicker: "FAQ",
      title: "Questions you might have first",
      items: [
        ["Is Yanfield a standalone app?", "No. It is a DeepSeek Harness plugin. After you install it and restart Harness, a Yanfield entry appears in the sidebar."],
        ["Do I need another API key?", "Not for Yanfield itself. Models come from the services already configured in Harness (DSH account, official API key or a custom model), and you pick one inside Yanfield."],
        ["Will the AI change my text without asking?", "No. Prose changes appear as a candidate draft, paragraph by paragraph. Only after you keep or revert them and click Confirm review are the kept paragraphs written; note changes are confirmed item by item in the task card."],
        ["Where is my manuscript stored?", "In a local SQLite database, by default <code>$DSH_HOME/yanfield/yanfield.db</code>. You can export backups in Settings; removing the plugin does not delete it."],
        ["Can I write in English?", "Yes. The interface follows the Harness language setting in English and Chinese, and the AI replies in the language you write in. The bundled sample books are Chinese demos; create a new book to write in English."],
        ["Can I use it commercially?", "No. The license is PolyForm Noncommercial 1.0.0, which does not allow commercial use. Novels written with it belong to their author."],
        ["What happened to the earlier standalone Yanfield?", "The project now continues as a DSH plugin. The earlier standalone repository is kept only as history: <a href=\"{legacy}\">ZzimaR/yanfield</a>."],
      ],
    },
    footer: {
      tagline: "A long-form writing desk inside DeepSeek Harness.",
      madeBy: "Yanfield is a plugin for DeepSeek Harness, made by ZzimaR.",
      groups: [
        { title: "Project", links: [["GitHub repository", "repo"], ["Releases", "releases"], ["npm package", "npm"], ["Report an issue", "issues"]] },
        { title: "Docs", links: [["Features", "docs.features"], ["AI and cost", "docs.ai"], ["FAQ", "docs.faq"], ["License", "license"]] },
        { title: "History", links: [["Earlier standalone repository (reference only)", "legacy"]] },
      ],
      top: "Back to top",
    },
    ext: "(opens in a new tab)",
    notFound: {
      title: "Page not found · Yanfield",
      heading: "This page hasn’t been written yet.",
      body: "The page you were looking for doesn’t exist, or has moved.",
      home: "Back to the home page",
      other: "中文",
    },
  },
}
