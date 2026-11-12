import { ArrowDown, ArrowRight, Check, CornerDownRight, KeyRound, LockKeyhole, Monitor, MoveUpRight } from "lucide-react";
import { InkstoneMark } from "@/components/brand/InkstoneMark";
import { GitHubMark } from "./GitHubMark";
import { ThemeToggle } from "./ThemeToggle";
import { GITHUB_URL } from "./constants";
import { WorkspacePreview, MaterialDocumentPreview } from "./WorkspacePreview";
import { LandingReview } from "./LandingReview";
import styles from "./PublicIntro.module.css";

const FAQS=[
  ["免费，具体指什么？","砚田软件可免费用于非商业用途，自托管不收订阅费，也不按字数收费。接入 DeepSeek 的费用由 DeepSeek 官方收取；使用内置的离线演示模式则无需购买砚田的 AI 积分。源码公开，使用与分发遵循 PolyForm Noncommercial 1.0.0。"],
  ["我的稿子真的留在本地吗？","书稿、资料和对话默认保存在运行砚田的那台电脑或自有服务器上。砚田没有自有的稿件云端，也没有遥测。调用 DeepSeek 时，完成任务所需的上下文会发送给 DeepSeek；可以在写作台查看和调整资料范围；离线演示模式不会发出任何请求。"],
  ["可以用哪些 API？","本构建专精 DeepSeek：在设置里填入 DeepSeek 官方 API Key，即可使用对话、写作与账户余额查询。其他服务商适配已移除；没有 Key 时可用内置的离线演示模式。API Key 由你自行管理，请求从你的部署环境发往 DeepSeek。"],
  ["AI 会直接覆盖我写的东西吗？","生成结果先进入待确认清单。正文在写作区对比，逐处保留或还原；资料可以逐项、逐字段确认。点击应用才写入，之后可以撤回。若应用后又有编辑，撤回会先检查版本，避免覆盖后续修改。"],
  ["这个网站可以直接写作吗？","这里是产品介绍。请从 GitHub 获取项目，在自己的电脑或服务器运行；不需要注册砚田账号。首次启动会创建示例书稿，基础写作离线可用，多步 AI 助手需要配置实际模型。"],
];

export function PublicIntro() {
  return <div className={styles.page} id="top">
    <header className={styles.header}><div className={styles.navInner}>
      <a href="#top" className={styles.brand} aria-label="砚田首页"><InkstoneMark className="size-8"/><span>砚田<span className={styles.brandEnglish}>YANFIELD</span></span></a>
      <nav aria-label="介绍页导航"><a href="#workspace">写作台</a><a href="#privacy">隐私</a><a href="#start">开始使用</a><ThemeToggle/><a href={GITHUB_URL} className={styles.sourceLink} target="_blank" rel="noreferrer"><GitHubMark className="size-4"/><span>GitHub</span><MoveUpRight className="size-3"/></a></nav>
    </div></header>
    <main>
      <section className={`${styles.container} ${styles.hero}`}>
        <div className={styles.heroCopy}><p className={styles.eyebrow}><span/>本地优先的 AI 小说工作台</p>
          <h1>故事归你。<br/>写作，<span>也由你做主。</span></h1>
          <p className={styles.heroDescription}>把长篇的正文、人物和伏笔放在一张写作台上。<br className={styles.desktopBreak}/>让 AI 动手改稿，让每一次取舍留在你手里。</p>
          <div className={styles.heroActions}><a href="#start" className={styles.primary}>免费部署，开始写作<ArrowRight className="size-4"/></a><a href="#workspace" className={styles.textLink}>先看看它怎么写<ArrowDown className="size-3.5"/></a></div>
          <p className={styles.heroNote}>无需账号 · 自带 DeepSeek Key · 非商业用途免费</p>
        </div>
        <div className={styles.heroDemo}><div className={styles.demoMargin}>给作者的最后一票</div><LandingReview/><span className={styles.demoCaption}><CornerDownRight className="size-3.5"/>AI 提出修改，你决定留下什么。</span></div>
      </section>
      <section className={`${styles.container} ${styles.principles}`} aria-label="砚田的四个特点">
        {[["01","稿子自己保管","保存在自己的电脑或服务器。"],["02","软件免费使用","非商业自托管，无订阅费。"],["03","DeepSeek 专精","对接官方 API，也可离线演示。"],["04","改动自己确认","逐处审阅，点头后才写入。"]].map(([no,title,detail])=><div key={no}><span className={styles.number}>{no}</span><h2>{title}</h2><p>{detail}</p></div>)}
      </section>
      <section id="workspace" className={`${styles.container} ${styles.workspace}`}>
        <div className={styles.sectionTop}><div><p className={styles.eyebrow}>一张桌子，装下整本小说</p><h2>从第一句，到最后一次改稿。</h2></div><p>查资料不必离开正文。<br/>写到哪里，助手就陪你工作到哪里。</p></div>
        <figure className={styles.productFrame}><div className={styles.frameBar}><span className={styles.frameDots}><i/><i/><i/></span><span>砚田 · 写作台</span><span><LockKeyhole className="size-3"/>本地书稿</span></div><WorkspacePreview/><figcaption>可交互的写作台预览 · 示例数据，所有操作仅在本页演示</figcaption></figure>
        <div className={styles.workflowGrid}>
          <article><span className={styles.smallIndex}>01 / 阅读</span><h3>先读懂这本书。</h3><p>按需读取前文、章纲、人物和设定。你可以 @ 指定材料，也可以调整上下文范围，省去反复复制粘贴。</p></article>
          <article><span className={styles.smallIndex}>02 / 执行</span><h3>会动手的写作助手。</h3><p>续写、改稿、补章纲、整理资料卡，放在一条任务里完成。过程和引用可展开查看，生成后先列出改动。</p></article>
          <article><span className={styles.smallIndex}>03 / 审阅</span><h3>像改代码一样改小说。</h3><p>新增、删除直接标在正文里。每一处都能保留或还原；资料按字段对比，确认后一起写入，也能撤回。</p></article>
        </div>
      </section>
      <section id="privacy" className={styles.privacy}><div className={`${styles.container} ${styles.privacyInner}`}>
        <div><p className={styles.eyebrow}>你的书房，你的规则</p><h2>写了十万字，<br/>也不用把稿子交给平台保管。</h2><p className={styles.privacyLead}>不用把作品绑在一个账号里，也不用为了换个服务搬走整本书。砚田负责把工具做好，书稿和选择权留给你。</p><a href={`${GITHUB_URL}/blob/main/README.md`} target="_blank" rel="noreferrer" className={styles.privacyLink}>源码公开，欢迎检查<MoveUpRight className="size-3.5"/></a></div>
        <div className={styles.dataFlow}><div className={styles.localNode}><Monitor className="size-5"/><span><strong>你的部署环境</strong><small>书稿 · 人物 · 设定 · 对话 · API 配置</small></span><span className={styles.localTag}>本地保存</span></div><div className={styles.flowLine}><span>仅在调用时发送选取的上下文</span><ArrowDown className="size-4"/></div><div className={styles.remoteNode}><KeyRound className="size-5"/><span><strong>DeepSeek 官方模型</strong><small>你的 API Key，或内置离线演示</small></span></div><p>“本地保存”不等于云端模型不接收内容。使用 DeepSeek API 时，所选上下文会交给 DeepSeek；使用离线演示模式则不会发出请求。</p></div>
      </div></section>
      <section className={`${styles.container} ${styles.materials}`}><div className={styles.materialCopy}><p className={styles.eyebrow}>灵感也有地方安放</p><h2>写得越长，<br/>越需要一份好记性。</h2><p>人物的目标、世界的规矩、还没回收的伏笔，不该散落在聊天记录里。</p><ul>{["角色、世界观与伏笔，分别整理成卡","总纲、卷纲、章纲，随时回到故事主线","逐章故事档案，追踪状态和时间线","已有 TXT 导入，Markdown / TXT 导出"].map(s=><li key={s}><Check className="size-3.5"/>{s}</li>)}</ul></div><figure className={styles.cardFigure}><MaterialDocumentPreview/><figcaption>资料可直接编辑，也可以交给助手一起整理。</figcaption></figure></section>
      <section id="start" className={styles.install}><div className={`${styles.container} ${styles.installInner}`}><div><p className={styles.eyebrow}>给故事一个自己的地方</p><h2>装好，接上 DeepSeek。<br/>下一句，就从这里开始。</h2><p>需要 Node.js ≥ 22.13 和 pnpm。首次启动自动创建数据库，无需另外配置数据库服务。</p><div className={styles.heroActions}><a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.primary}><GitHubMark className="size-4"/>获取项目<MoveUpRight className="size-3.5"/></a><a href={`${GITHUB_URL}/blob/main/docs/deploy.md`} target="_blank" rel="noreferrer" className={styles.textLink}>部署文档<ArrowRight className="size-3.5"/></a></div></div><div className={styles.terminal}><div><span>本地开始 / TERMINAL</span><span>01—04</span></div><pre><code><span>git clone</span> https://github.com/ZzimaR/Yanfield.git{"\n"}<span>cd</span> Yanfield{"\n"}<span>pnpm</span> install{"\n"}<span>pnpm</span> dev</code></pre><p>打开 http://127.0.0.1:3000，在设置中填入 DeepSeek API Key。</p></div></div></section>
      <section id="faq" className={`${styles.container} ${styles.faq}`}><div><p className={styles.eyebrow}>开始之前</p><h2>把话说清楚。</h2><p>关于免费、隐私，还有 AI。</p></div><div>{FAQS.map(([q,a])=><details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
    </main>
    <footer className={`${styles.container} ${styles.footer}`}><a href="#top" className={styles.brand}><InkstoneMark className="size-7"/><span>砚田</span></a><p>写作的工具，故事的自由。<small>开发中 · 源码公开 · 非商业用途免费</small></p><a href={GITHUB_URL} target="_blank" rel="noreferrer">在 GitHub 上一起改进<MoveUpRight className="size-3"/></a></footer>
  </div>;
}
