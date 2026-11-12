/**
 * 内置提示词预设 + 首次启动的示例作品数据
 * 说明：预设模板中的 {{...}} 占位符由服务端上下文装配器替换。
 */
import type { AiFeature, Character, Chapter, ChapterBlueprint, Foreshadow, ModelOption, Novel, NovelOutline, PromptPreset, ProviderKind, StoryArchive, Volume, VolumeOutline, WorldSetting } from "./types";

export type BuiltinPresetDef = Omit<PromptPreset, "id" | "updatedAt" | "novelId">;

const base = (feature: AiFeature, name: string, systemPrompt: string, userTemplate: string, temperature: number, modelRole: "chat" | "prose" = "chat"): BuiltinPresetDef => ({
  feature,
  name,
  systemPrompt,
  userTemplate,
  temperature,
  modelRole,
  isBuiltin: true,
  enabled: true,
});

const WRITER_STYLE = `你是一位深耕中文网文多年的职业作者，擅长在保持作者既有文风的前提下写出「人味」：
- 具体大于抽象：用动作、感官、对话推进，不写「他感到很难过」，写他做了什么。
- 节奏控制：短句推进紧张，长句铺陈氛围；每 3–5 段必须有一个信息增量。
- 不总结、不解释、不替读者下结论；少用「仿佛/似乎/不禁/顿时/空气仿佛凝固了」这类陈词。
- 不写提纲式句子，不写旁白总结段。`;

export const BUILTIN_PRESETS: BuiltinPresetDef[] = [
  base(
    "chat",
    "通用写作搭档",
    `你是一位专业的中文小说创作搭档，熟悉网文的读者心理与商业节奏，也懂严肃文学的表达。
工作要求：
1. 先读上下文（大纲、设定、档案、前文），再回答；上下文没有的信息不要编造。
2. 回答要具体、可执行：给方案、给示例句子，而不是罗列空泛建议。
3. 涉及正文改写时，只输出可以直接替换的正文，不要解释「我改了什么」。
4. 不确定的地方明确说「待确认」。`,
    `【作品】{{novelTitle}}（{{genre}}）
【上下文】
{{context}}

【作者消息】
{{message}}`,
    0.8,
  ),
  base(
    "continue",
    "承接续写",
    WRITER_STYLE +
      `\n续写要求：严格承接最后一段的动作与情绪，保持叙述视角一致；不要复述前文，不要另起场景；一次写 {{words}} 字左右，结尾留一个小钩子。`,
    `【本章目标】{{chapterGoal}}
【最近正文（结尾部分）】
{{tail}}

请接着最后一段继续写 {{words}} 字左右。只输出正文，不要标题、不要解释。`,
    0.85,
    "prose",
  ),
  base(
    "expand",
    "扩写细节",
    WRITER_STYLE + `\n扩写要求：不增加新情节，只把已有情节写得更具体：补充动作、环境、感官与心理；篇幅约为原文的 {{ratio}} 倍。`,
    `【待扩写正文】
{{selection}}

请扩写上面的内容，保持原意与情节不变，只增加细节与画面感。只输出正文。`,
    0.75,
    "prose",
  ),
  base(
    "polish",
    "润色语言",
    WRITER_STYLE + `\n润色要求：保留原意与信息量，只改语言：删冗余、换掉形容词堆砌、把说明改成动作；不要新增情节。`,
    `【待润色正文】
{{selection}}

请润色上面的内容。只输出润色后的正文。`,
    0.6,
    "prose",
  ),
  base(
    "rewrite",
    "换角度改写",
    WRITER_STYLE + `\n改写要求：依照作者的指令改变表达角度或情绪，情节结果不变。`,
    `【原文】
{{selection}}

【改写要求】{{instruction}}

请按上面的要求改写。只输出改写后的正文。`,
    0.8,
    "prose",
  ),
  base(
    "deai",
    "去 AI 味",
    `你是中文网文编辑，专治「AI 味」。诊断标准：
- 空泛排比与对称句式（「不是……而是……」堆叠）
- 总结式收尾、抒情式升华、哲理式金句
- 抽象形容词代替具体细节（「眼神深邃」「气氛凝固」）
- 每段长度过于均匀、节奏缺少变化
- 过度解释人物心理，替读者下结论
改写时：删掉总结句，把抽象改成具体动作与感官，打散整齐句式，允许口语与不完美。不新增情节。`,
    `【正文】
{{selection}}

请去除上面正文的 AI 味。只输出改写后的正文，不要解释。`,
    0.85,
    "prose",
  ),
  base(
    "diagnose",
    "章节体检",
    `你是资深网文主编，用可量化的方式给章节做体检。评价维度：开头钩子、信息密度、冲突推进、爽点/情绪价值、人物动机、章末悬念、AI 味。
输出格式（Markdown）：
1. 一句话结论
2. 分项打分（每项 1–10，说明扣分理由与原文依据）
3. 三个最值得改的地方（按优先级）
4. 「如果只改一处」的具体改法`,
    `【本章正文】
{{chapter}}

请按上面的格式给本章做体检。`,
    0.4,
  ),
  base(
    "outline-novel",
    "生成总纲",
    `你是结构工程师，擅长把模糊想法变成可执行的小说总纲。输出 Markdown，包含：
## 一句话故事
## 主题与基调
## 主线（三幕/起承转合，标注关键转折）
## 支线（2–4 条，说明如何与主线交汇）
## 人物弧光（主角 + 2 位关键配角）
## 世界规则（3–5 条会限制人物的硬规则）
## 结局构想
## 核心卖点（3 条，面向目标读者）`,
    `【题材】{{genre}}
【作者想法】
{{message}}

请生成总纲。`,
    0.9,
  ),
  base(
    "outline-volume",
    "生成卷纲",
    `你是结构工程师。基于总纲与已有章节，设计一卷的卷纲：本卷目标、核心冲突升级路径、关键事件（5–8 个，标注章号区间）、本卷要埋/收的伏笔、卷末高潮与钩子。保持与前文衔接，不重复已写内容。`,
    `【总纲】
{{novelOutline}}

【已有剧情摘要】
{{context}}

【本卷设想】
{{message}}

请输出卷纲。`,
    0.85,
  ),
  base(
    "outline-chapter",
    "生成章纲",
    `你是结构工程师。为一章设计可直接执行的章纲：本章目标（推进哪条线）、核心冲突、分场计划（2–4 场，标注地点/出场人物/各自目的）、情绪曲线、关键信息释放、章末钩子、预计字数。避免与前后章重复。`,
    `【总纲要点】
{{novelOutline}}

【卷纲】
{{volumeOutline}}

【前情】
{{context}}

【本章设想】
{{message}}

请输出章纲（含分场计划）。`,
    0.85,
  ),
  base(
    "archive-extract",
    "提取本章档案",
    `你是故事档案员。只记录正文里**真实写过**的事实，不做推断、不补全、不美化。
输出严格 JSON（不要 markdown 代码块、不要注释）：
{
  "chapterSummary": "本章发生了什么，2–3 句，只陈述事实",
  "characterStates": [{"name":"角色名","state":"本章结束时状态（位置/伤势/心态/关系）","changes":"本章发生的变化"}],
  "settingStates": [{"title":"设定名","state":"本章对该设定的新增或变化"}],
  "ledger": [{"name":"数值/资源名","delta":"+2 或 消耗 3 枚","balance":"结余，若正文未给出则写 待确认","note":"依据原句要点"}],
  "timeline": [{"storyTime":"故事内时间","event":"事件"}],
  "foreshadows": [{"title":"伏笔名","status":"planted|advanced|paid|dropped","note":"依据"}],
  "conflicts": [{"topic":"冲突主题","detail":"与哪一章的哪句冲突，列原句","status":"pending"}]
}
规则：推不出的字段留空数组；有矛盾必须放进 conflicts，不许自行调和；不许出现正文没写过的人名/设定。`,
    `【本章标题】{{chapterTitle}}
【本章正文】
{{chapter}}

请输出档案 JSON。`,
    0.2,
  ),
  base(
    "chapter-summary",
    "本章摘要",
    `用 80–120 字概括本章已发生的事实（人物、地点、关键动作、结果、章末状态），只写正文写过的内容，不评论、不预告。`,
    `【本章正文】
{{chapter}}

请输出摘要。`,
    0.3,
  ),
  base(
    "character-card",
    "角色卡补全",
    `你是设定编辑。作者会给你一个初步想法，或角色卡里已经写下的草稿，请把它写成能直接放进角色卡的内容。
规则：
- 保留作者已经写出的关键信息，只做完善，不要换成另一个人。
- 性格从行为与选择里体现，少用形容词堆砌。
- 没有依据的地方沿用作者已经写下的说法，不要编造姓名、年龄、经历，也不要列「待确认」。
- 若任务指定了某一个字段，只输出该字段的成稿，不要输出整张卡，不要加标题和解释。
- 若任务是补全当前角色卡，只输出 JSON：{"identity":"","appearance":"","personality":"","goals":"","secrets":"","arc":"","speechStyle":"","currentState":""}。不要改姓名，不要提问。`,
    `【作者任务】
{{message}}

【本书已有内容】
{{context}}

请按作者任务输出。`,
    0.5,
  ),
  base(
    "world-card",
    "设定卡补全",
    `你是设定编辑。只完善作者正在编辑的这一条设定。
规则：
- 保留作者已经写出的事实，不要换成另一套设定，也不要把别的地点、城、人展开进这张卡。
- 不要向作者提问，不要列「待确认」清单。没写的人名、制度、距离，沿用作者的说法留在正文里。
- 若任务指定了某一个字段，只输出该字段的成稿，不要标题，不要提问。
- 若任务是补全当前卡片，只输出 JSON：{"summary":"一两句","content":"这张卡自己的正文"}。不要 Markdown 标题。`,
    `【作者任务】
{{message}}

【本书已有内容】
{{context}}

请按作者任务输出。`,
    0.6,
  ),
  base(
    "foreshadow-card",
    "伏笔卡补全",
    `你是设定编辑。只完善作者正在编辑的这一条伏笔。
规则：
- 保留作者已经写出的事实，不要换成另一条伏笔，也不要把别的线索展开进这张卡。
- 不要向作者提问，不要列「待确认」清单。
- 若任务指定了某一个字段，只输出该字段的成稿，不要标题，不要提问。
- 若任务是补全当前伏笔，只输出 JSON：{"description":"埋了什么、怎么收","notes":"只给作者看的提醒"}。`,
    `【作者任务】
{{message}}

【本书已有内容】
{{context}}

请按作者任务输出。`,
    0.5,
  ),
  base(
    "consistency-check",
    "一致性检查",
    `你是考据编辑。对照故事档案与设定，检查给定章节范围的矛盾：人物状态/位置、时间线、数值、地理、因果、已知信息时间点。按严重程度排序，每条给出：问题、依据（章节+原句）、修正建议（两套方案）。没有问题就明确说没有。`,
    `【待检查范围】
{{context}}

【本章正文（可选）】
{{chapter}}

请输出一致性检查报告。`,
    0.3,
  ),
  base(
    "pacing",
    "节奏分析",
    `你是结构分析师。分析章节/卷的节奏曲线：紧张点与松弛点分布、信息密度、爽点间隔、读者可能流失的位置。给出可执行调整建议与参考的同类爆款节拍。`,
    `【分析对象】
{{context}}

请输出节奏分析报告。`,
    0.5,
  ),
  base(
    "titles",
    "起名",
    `你是书名编辑。基于设定与卖点生成 12 个候选书名：4 个直白爽感型、4 个意境型、4 个悬念型。每个名字给一句理由与目标读者。最后推荐 3 个并说明投放场景差异（站短/简介/封面）。`,
    `【作品信息】
{{context}}

【偏好】
{{message}}`,
    0.9,
  ),
  base(
    "synopsis",
    "写简介",
    `你是网文简介写手。写三个版本简介：A. 站短版（80 字，冲突+悬念+爽点）；B. 详情页版（200 字，世界观+主角困境+金手指+看点）；C. 一句话 pitch。不要流水账，不要剧透结局，每个版本都要有钩子。`,
    `【作品信息与大纲】
{{context}}

【作者补充】
{{message}}`,
    0.9,
  ),
  base(
    "imitate",
    "爆款仿写",
    `你是文风分析师。先提炼范例的「可迁移特征」：句长节奏、对话与叙述比例、信息释放速度、爽点类型、常用句式；再在**不抄袭具体情节与句子**的前提下，用这些特征写一段本地化示例（300–500 字），并列出你迁移了哪些特征。`,
    `【范例文本】
{{selection}}

【仿写要求】
{{message}}

【本书上下文】
{{context}}`,
    0.9,
    "prose",
  ),
];

/* ============================== 示例作品 ============================== */
/* 原创演示稿《潮信》，不借用任何已出版书名、人物或情节。 */

export const DEMO_NOVEL: Omit<Novel, "id" | "createdAt" | "updatedAt" | "lastOpenedAt"> = {
  title: "潮信",
  subtitle: "退潮之前，把信送出去",
  author: "砚田示例",
  genre: "志怪",
  tags: ["渡口", "书信", "市井", "慢热"],
  synopsis:
    "江尾渡口的记账人周晚，负责登记每一封没有寄件人的潮信。退潮那夜，信自己写完了回信，收件人却是三年前已经离渡的人。",
  coverKey: "mist",
  status: "serializing",
  wordGoal: 600000,
  targetChapters: 180,
  styleGuide: "第三人称限知，句子短，对话留半句；少用感叹号；景物只写跟信、潮、船有关的细节；每章结尾落在一封没拆开的信上。",
  pov: "第三人称限知",
  forbiddenWords: ["仿佛", "似乎", "不禁", "顿时"],
};

export const DEMO_VOLUMES: { title: string; summary: string }[] = [
  { title: "第一卷 · 退潮", summary: "周晚在渡口接到第一封自己署名的潮信，开始查三年前失踪的渡船。" },
  { title: "第二卷 · 对岸", summary: "为了把一封不该存在的信送回去，周晚跟小满趁夜潮过江。" },
];

export const DEMO_NOVEL_OUTLINE: Omit<NovelOutline, "id" | "novelId" | "updatedAt"> = {
  premise: "渡口记账人发现潮水会把未寄出的信送回来，而其中一封的收件人是他自己。",
  theme: "没说出口的话，会不会自己找路。",
  tone: "潮湿、克制、带一点日常怪谈",
  mainPlot:
    "周晚继承陈伯的账本，负责登记潮信 → 小满送来一封没有寄件人的信，收件人写着周晚 → 税关主事顾衡要没收全部潮信 → 周晚发现三年前那班夜船的乘客名单被涂掉一行 → 对岸旧码头只剩一艘纸船 → 他把信放进纸船，自己留在渡口继续记账。",
  subplots: ["小满折的纸船总能在退潮时靠岸", "顾衡在找一封能证明税关漏税的旧信", "陈伯的账本最后一页是空白的"],
  characterArcs: [
    { character: "周晚", arc: "从只记账、不拆信，到愿意为别人读完一封回不来的信" },
    { character: "小满", arc: "从帮人送信的小孩，到决定自己写第一封信" },
    { character: "顾衡", arc: "从按规章办事，到承认有些信不该被归档" },
  ],
  worldRules: ["退潮时无人寄出的信会自己出现在渡口石阶上，称为潮信", "潮信必须在下一次涨潮前送达，否则收件人的名字会从账本上淡掉", "渡口的人不能拆别人的信，记账人只登记封皮"],
  ending: "周晚把那封写给自己的信放进小满的纸船。纸船靠上对岸时是空的。他在账本上记下：此信已送出，收件人未取。",
  hooks: ["潮信是谁写的", "三年前夜船少的那个人", "账本空白页为什么会自己出现字"],
};

export const DEMO_VOLUME_OUTLINES: Omit<VolumeOutline, "id" | "volumeId" | "novelId" | "updatedAt">[] = [
  {
    summary: "周晚在渡口立足，接到第一封署名自己的潮信，并发现税关在收信。",
    arcGoal: "立住渡口规矩和主角的职业习惯，完成第一次「要不要拆信」的选择。",
    keyEvents: ["退潮，石阶上出现三封潮信", "小满来取信", "顾衡封渡", "周晚发现账本少了一行", "他没有拆那封写给自己的信"],
    foreshadowPlan: ["埋：纸船总能自己靠岸", "埋：账本最后一页是空白", "埋：陈伯说漏嘴「那班船没有靠岸」"],
  },
  {
    summary: "为了在涨潮前把信送出去，周晚和小满夜渡。",
    arcGoal: "把送信从职业变成选择，主角付出一次不能回头的代价。",
    keyEvents: ["夜渡", "顾衡在对岸等", "纸船是空的", "周晚决定继续记账"],
    foreshadowPlan: ["收：潮信的来处", "收：小满为什么会折纸船", "留：对岸还有没有第二座渡口"],
  },
];

export const DEMO_CHARACTERS: Omit<Character, "id" | "novelId" | "createdAt" | "updatedAt">[] = [
  {
    name: "周晚",
    aliases: ["晚记"],
    role: "protagonist",
    gender: "男",
    age: "二十一",
    identity: "江尾渡口记账人，陈伯的学徒",
    appearance: "瘦高，袖口总有墨点，腰间挂一本油布包着的账本，说话时习惯先看封皮再看人。",
    personality: "谨慎、较真，不喜欢别人催；对规矩很死，对没写下来的事却心软。",
    goals: "把每一封潮信在涨潮前送出去；弄清三年前那班夜船为什么没有回程。",
    secrets: "他自己的名字曾经出现在一封潮信的收件人栏里，他假装没看见。",
    arc: "从只登记封皮，到愿意读一封也许没有回音的信。",
    speechStyle: "短句，先报数字和时辰；急的时候反而更慢。",
    relations: [
      { targetId: "小满", relation: "搭档", note: "她送信，他记账，彼此不问信里写了什么" },
      { targetId: "陈伯", relation: "师父", note: "把账本交给他之后就很少下渡口" },
    ],
    currentState: "账本夹着一封未登记的信；欠税关两文抄录费。",
    aiVisible: true,
    revealAtChapter: null,
    tags: ["主角", "记账", "渡口"],
    pinned: true,
  },
  {
    name: "小满",
    aliases: [],
    role: "supporting",
    gender: "女",
    age: "十七",
    identity: "在渡口折纸船、替人跑腿送信的人",
    appearance: "头发用蓝布条扎着，手指上常有浆糊，口袋里总有没写完的空白信纸。",
    personality: "嘴快，记性好，遇到不该问的问题会改口去数船。",
    goals: "把一封没有地址的信送到对岸。",
    secrets: "她折的纸船用的是别人没寄出的信纸。",
    arc: "从替人跑腿，到自己写下第一封署名的信。",
    speechStyle: "语速快，爱把话说一半；紧张时会把纸船折了又拆。",
    relations: [{ targetId: "周晚", relation: "搭档", note: "知道他有一封没登记的信" }],
    currentState: "被顾衡的人问过纸船的来路。",
    aiVisible: true,
    revealAtChapter: null,
    tags: ["送信", "纸船"],
    pinned: true,
  },
  {
    name: "顾衡",
    aliases: ["顾主事"],
    role: "antagonist",
    gender: "男",
    age: "四十出头",
    identity: "江尾税关主事",
    appearance: "青布官袍洗得很干净，指甲缝里没有墨，说话时把信按在桌上对齐。",
    personality: "讲究程序，不骂人，但每句话都像在归档。",
    goals: "把所有潮信收进税关，按寄件人补税。",
    secrets: "三年前那班夜船的舱单在他手里，少了一行名字。",
    arc: "从执行规章，到承认有的信不能进档案柜。",
    speechStyle: "慢，爱说「按册」；从不提高声音。",
    relations: [{ targetId: "陈伯", relation: "旧识", note: "陈伯曾把一封信交给他保管" }],
    currentState: "已注意到周晚的账本比税关的册子多一页。",
    aiVisible: true,
    revealAtChapter: null,
    tags: ["税关", "对手"],
    pinned: true,
  },
  {
    name: "陈伯",
    aliases: ["老陈"],
    role: "mentor",
    gender: "男",
    age: "六十出头",
    identity: "前任渡口记账人，现在修船",
    appearance: "背有点驼，左手食指缺一节，修船时嘴里含着竹哨。",
    personality: "话少，爱把事情说成天气；对徒弟严格，对陌生人客气。",
    goals: "让渡口继续有人记账，自己不再碰潮信。",
    secrets: "空白页上的字是他后来补的，不是潮水写的。",
    arc: "从沉默，到把那一页的真相告诉周晚。",
    speechStyle: "短，常说「潮来了就走」。",
    relations: [{ targetId: "周晚", relation: "师徒", note: "把账本和规矩一起交出去" }],
    currentState: "知道周晚开始查夜船，假装只关心船底漏不漏。",
    aiVisible: true,
    revealAtChapter: null,
    tags: ["师父", "渡口"],
    pinned: false,
  },
];

export const DEMO_WORLD: Omit<WorldSetting, "id" | "novelId" | "createdAt" | "updatedAt">[] = [
  {
    parentId: null,
    title: "潮信",
    category: "rule",
    importance: "high",
    summary: "退潮时，没有寄出的信会出现在渡口石阶上，必须在下次涨潮前送达。",
    content: "潮信没有邮戳。封皮上的字有时是寄件人写的，有时是后来才显出来的。送达之前不能拆。过了涨潮还没送到，收件人的名字会从账本上变淡。",
    tags: ["核心设定"],
    aiVisible: true,
    revealAtChapter: null,
    orderIndex: 0,
    pinned: true,
  },
  {
    parentId: null,
    title: "渡口账本",
    category: "item",
    importance: "high",
    summary: "记账人只登记封皮：时辰、收件人、是否送达。信的内容不入账。",
    content: "账本用油布包着，每页二十四行。最后一页按规矩留白，用来记「送出但无人认领」的信。陈伯交接时，这一页是空的。",
    tags: ["道具", "规矩"],
    aiVisible: true,
    revealAtChapter: null,
    orderIndex: 1,
    pinned: true,
  },
  {
    parentId: null,
    title: "江尾渡口",
    category: "geography",
    importance: "medium",
    summary: "江水在这里分成两岔，一边去市集，一边去对岸废弃的旧码头。",
    content: "渡口白天运货，夜里只留一盏桅灯。税关在上游半里，管船税和信税。旧码头三年前停用，石阶还在，船桩已经朽了。",
    tags: ["地点"],
    aiVisible: true,
    revealAtChapter: null,
    orderIndex: 2,
    pinned: false,
  },
  {
    parentId: null,
    title: "税关",
    category: "faction",
    importance: "medium",
    summary: "负责船税与信税。顾衡上任后，要求潮信也要登记在税册上。",
    content: "税关不送信，只归档。他们要的是寄件人的名字和件数。周晚的账本若比税册多出一封，就算漏税。",
    tags: ["机构"],
    aiVisible: true,
    revealAtChapter: null,
    orderIndex: 3,
    pinned: false,
  },
];

export const DEMO_FORESHADOWS: Omit<Foreshadow, "id" | "novelId" | "createdAt" | "updatedAt">[] = [
  { title: "账本空白页", description: "陈伯交接时最后一页是空白的，周晚后来发现那一页有浅浅的水痕。", plantedChapterId: null, payoffChapterId: null, status: "planted", notes: "计划第二卷说明是谁写的" },
  { title: "自己靠岸的纸船", description: "小满没有放进水里的纸船，退潮后会出现在石阶最下面一级。", plantedChapterId: null, payoffChapterId: null, status: "advanced", notes: "第十章左右交代纸的来历" },
  { title: "夜船少一人", description: "陈伯说那班船「人数对得上」，账本草稿里却涂掉了一行。", plantedChapterId: null, payoffChapterId: null, status: "planted", notes: "第一卷末让顾衡的舱单对上" },
];

export function demoChapterContent(index: number): string {
  const ch1 = `<p>退潮比账本上记的早了两刻。</p>
<p>周晚把油布账本摊在石阶上，数了数刚冒出来的信。三封。封皮都潮，字还清楚。第一封给米行的孙掌柜，第二封没有寄件人，第三封的收件人栏写着：周晚。</p>
<p>他盯着自己的名字看了一会儿，把那封信翻过去，先登记前两封。</p>
<p>「晚记。」小满从跳板上下来，手里捏着一只没折完的纸船，「今天有我的吗？」</p>
<p>「没有。」</p>
<p>「那我跑孙掌柜那封。」她伸手。周晚把信递过去，指节在封皮上停了一下，「涨潮前送到。别拆。」</p>
<p>「我什么时候拆过。」小满把信塞进布袋，又看了看他按着的那一封，「这封呢？」</p>
<p>「还没登记。」</p>
<p>江风从对岸过来，把纸船的一只角吹平了。小满没把船放进水里。她走后，周晚再低头，石阶最下一级多了一只纸船，船舱里空着，沿口却有一行很小的字：此信无地址，请记账人自取。</p>`;
  const ch2 = `<p>税关的人在涨潮前到了渡口。</p>
<p>顾衡自己没下马，让书办把税册摊开，一页页对周晚的账。对到最后，书办抬起头：「你们多一封。」</p>
<p>周晚说：「那封还没登记。」</p>
<p>「没登记就是没交税。」顾衡终于下了马。他不看信，只看账本空白的最后一页，用指节敲了敲，「陈伯交接的时候，这一页是空的。」</p>
<p>「现在也是空的。」</p>
<p>顾衡笑了一下，很浅。「空页也会进水。三年前那班夜船，舱单在我这里。人数是对的。」他顿了顿，「你师父说不对。」</p>
<p>周晚没有接话。顾衡把税册合上：「明日午时之前，把多出来的那封送到税关。按册，无主信件归关里。」</p>
<p>人走后，石阶上的纸船还在。周晚把它捡起来，沿口那行字淡了，只剩「自取」两个字。他翻开账本最后一页——空白处多了一道水痕，形状像一个被涂掉的名字。</p>`;
  const ch3 = `<p>子时之前，小满回来了。</p>
<p>孙掌柜的信送到了。她在跳板上坐下，问周晚那封没登记的信还在不在。</p>
<p>周晚说在。他又说，税关要这封信。</p>
<p>小满把一只新折的纸船放在两人中间。「对岸旧码头还有桩。涨潮前赶得到。」她看着他，「你要是不敢拆，我也不拆。我们只送。」</p>
<p>周晚把信放进纸船。船很小，信角露在外面。江面起了风，纸船自己往水里滑了一寸。</p>`;
  if (index === 0) return ch1;
  if (index === 1) return ch2;
  return ch3;
}

export const DEMO_CHAPTERS: { title: string; content: string; summary: string; status: "draft" | "revising" | "done"; volumeIndex: number }[] = [
  {
    title: "第一章 空信",
    content: demoChapterContent(0),
    summary: "退潮提早，石阶上出现三封潮信，其中一封的收件人是周晚；他没有登记，小满离开后石阶上多了一只写着「自取」的纸船。",
    status: "done",
    volumeIndex: 0,
  },
  {
    title: "第二章 税册",
    content: demoChapterContent(1),
    summary: "顾衡来对账，指出账本比税册多一封信，限周晚明日交到税关；账本空白页出现一道像名字的水痕。",
    status: "done",
    volumeIndex: 0,
  },
  {
    title: "第三章 纸船",
    content: demoChapterContent(2),
    summary: "小满送完信回来，提议趁涨潮前把那封信送到对岸旧码头，两人约定不拆，只送。",
    status: "revising",
    volumeIndex: 0,
  },
  {
    title: "第四章 旧码头",
    content: "",
    summary: "",
    status: "draft",
    volumeIndex: 1,
  },
  {
    title: "第五章 回程",
    content: "",
    summary: "",
    status: "draft",
    volumeIndex: 1,
  },
];

export const DEMO_BLUEPRINTS: Omit<ChapterBlueprint, "id" | "chapterId" | "novelId" | "updatedAt">[] = [
  {
    goal: "立住潮信规矩和记账人的职业习惯，抛出「收件人是自己」的悬念。",
    pov: "周晚",
    conflict: "周晚按规矩不拆信，但这封信写着他的名字；小满在旁边等他决定。",
    emotionalArc: "例行公事 → 看见自己的名字 → 把信按住不登记",
    scenes: [
      { id: "s1", title: "退潮点信", summary: "周晚数出三封潮信，第三封收件人是自己。", purpose: "交代规矩与异常", characters: ["周晚"], location: "渡口石阶", emotion: "克制" },
      { id: "s2", title: "小满取信", summary: "小满来取孙掌柜的信，问到那封没登记的。", purpose: "引出搭档和主角的回避", characters: ["周晚", "小满"], location: "跳板", emotion: "日常里的停顿" },
      { id: "s3", title: "自取的纸船", summary: "小满走后，石阶上多了一只纸船。", purpose: "章末钩子", characters: ["周晚"], location: "石阶", emotion: "不安" },
    ],
    plotPoints: ["退潮提早", "第三封信写着周晚", "纸船沿口出现字"],
    hooks: ["谁把信写成他的名字", "纸船是不是小满留下的"],
    targetWords: 2800,
    notes: "不要解释潮信的来历，用登记动作把规矩演出来。",
  },
  {
    goal: "让税关第一次施压，暗示三年前的夜船名单有问题。",
    pov: "周晚",
    conflict: "顾衡要按册收走无主信，周晚还没决定这封信算不算无主。",
    emotionalArc: "被对账逼到墙角 → 听见师父的不同说法 → 独自发现水痕",
    scenes: [
      { id: "s1", title: "对册", summary: "书办指出账本多一封。", purpose: "把规矩变成压力", characters: ["周晚", "顾衡"], location: "渡口", emotion: "紧" },
      { id: "s2", title: "空白页", summary: "顾衡离开后，空白页出现水痕。", purpose: "留下可核对的物证", characters: ["周晚"], location: "石阶", emotion: "发冷" },
    ],
    plotPoints: ["税关限时收信", "夜船人数有两种说法", "空白页水痕"],
    hooks: ["陈伯为什么说人数不对", "水痕会不会变成字"],
    targetWords: 2600,
    notes: "顾衡不要写成恶人，他只是在执行一本对得上的册子。",
  },
];

export function demoArchiveContent(): Omit<StoryArchive, "id" | "novelId" | "chapterId" | "createdAt" | "updatedAt">[] {
  return [
    {
      chapterTitle: "第一章 空信",
      orderIndex: 1,
      chapterSummary: "退潮比账本早两刻。周晚登记了给孙掌柜的信和一封无寄件人的信，第三封收件人是他自己，他没有登记。小满取走孙掌柜的信后，石阶上多了一只纸船，沿口写着让记账人自取。",
      characterStates: [
        { name: "周晚", state: "在渡口石阶上记账，手按着未登记的信", changes: "发现潮信的收件人是自己" },
        { name: "小满", state: "带着孙掌柜的信离开", changes: "问过那封没登记的信，没有得到答案" },
      ],
      settingStates: [{ title: "潮信", state: "本日退潮出现三封，其中一封未登记" }],
      ledger: [{ name: "潮信", delta: "+3", balance: "已登记 2，未登记 1", note: "第三封收件人为周晚" }],
      timeline: [{ storyTime: "本年 · 退潮日", event: "石阶出现写给周晚的潮信" }],
      foreshadows: [{ title: "自取的纸船", status: "planted", note: "「此信无地址，请记账人自取」" }],
      conflicts: [],
      status: "fresh",
      sourceWordCount: 420,
      generatedBy: "ai",
      model: "离线演示模式",
    },
    {
      chapterTitle: "第二章 税册",
      orderIndex: 2,
      chapterSummary: "顾衡带人用税册核对渡口账本，认定多出一封未登记的信，限次日午时交到税关。他提到三年前夜船人数与陈伯的说法不一致。人走后，账本空白页出现像名字的水痕。",
      characterStates: [
        { name: "周晚", state: "仍持有未登记的信，欠税关一个交代", changes: "得知陈伯认为夜船人数不对" },
        { name: "顾衡", state: "持有夜船舱单，认为人数相符", changes: "第一次向周晚限期收信" },
      ],
      settingStates: [{ title: "渡口账本", state: "空白页出现水痕" }],
      ledger: [],
      timeline: [{ storyTime: "同年 · 涨潮前", event: "税关要求上交无主潮信" }],
      foreshadows: [{ title: "空白页水痕", status: "advanced", note: "水痕形状像被涂掉的名字" }],
      conflicts: [
        { topic: "夜船人数", detail: "顾衡称舱单人数相符；他转述陈伯认为人数不对。账本上尚未看到陈伯的原话。", status: "pending" },
      ],
      status: "stale",
      sourceWordCount: 390,
      generatedBy: "ai",
      model: "离线演示模式",
    },
  ];
}

export const DEMO_VOLUME_OUTLINE_SUMMARY = DEMO_VOLUME_OUTLINES;

/* ============================== 模型服务商预设 ============================== */

/**
 * 砚田只做 DeepSeek：设置页只保留一个 DeepSeek 官方预设，
 * 也支持手动改 baseUrl 接任意 OpenAI 兼容的 DeepSeek 中转服务。
 */
export interface ProviderPreset {
  key: string;
  name: string;
  /** 一句话说明，展示在设置页 */
  description: string;
  kind: ProviderKind;
  baseUrl: string;
  /** 申请 Key 的控制台 */
  keyUrl?: string;
  /** 本地部署时可用的环境变量名（服务启动时自动建 Provider） */
  envKeys: string[];
  models: ModelOption[];
  note?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek 官方接口。模型列表和可用权限以账户实时返回为准。",
    kind: "deepseek",
    baseUrl: "https://api.deepseek.com",
    keyUrl: "https://platform.deepseek.com/api_keys",
    envKeys: ["DEEPSEEK_API_KEY"],
    models: [],
  },
];

/** 环境变量 → 预设品牌（服务启动时按顺序自动创建，已有同名 Provider 会跳过） */
export const ENV_PROVIDER_BINDINGS: { preset: string; envKeys: string[] }[] = PROVIDER_PRESETS.filter((preset) => preset.key !== "custom").map((preset) => ({
  preset: preset.key,
  envKeys: preset.envKeys,
}));

export function getProviderPreset(key: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.key === key);
}
