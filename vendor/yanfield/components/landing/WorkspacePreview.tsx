"use client";
import {useState} from "react";
import { BookOpen, Check, ChevronDown, FilePenLine, ListTree, RotateCcw, Sparkles } from "lucide-react";
import { MaterialPreview } from "@/components/cards/MaterialPreview";
import styles from "./PublicIntro.module.css";

/** A read-only product preview rendered as text, so it stays crisp at any display scale. */
export function WorkspacePreview() {
  const [review,setReview]=useState(false),[kept,setKept]=useState(true);
  return <div className={styles.liveWorkspace}>
    <div className={styles.liveTop}><span>砚田 / 潮信</span><span>第一章 · 退潮</span><span><i/>示例书稿</span></div>
    <aside className={styles.liveLibrary}><div className={styles.liveTabs}><span>目录</span><span className={styles.liveActive}>设定</span><span>档案</span></div><p className={styles.liveGroup}>角色 <span>02</span></p>
      <div className={styles.liveMaterial}><MaterialPreview kind="character" fields={{name:"周晚",identity:"渡口的记账人",personality:"话少，遇事先核对记录。",goals:"查清那封重复出现的来信。",tags:["记账人"]}}/></div>
      <div className={styles.liveMaterial}><MaterialPreview kind="character" fields={{name:"小满",identity:"替晚记送信的姑娘",speechStyle:"简短直接，话到嘴边总留半句。",tags:["送信人"]}}/></div>
      <p className={styles.liveGroup}>世界观 <span>01</span></p><div className={styles.liveMaterial}><MaterialPreview kind="world" fields={{title:"晚记",category:"geography",summary:"渡口石阶上的收信铺。退潮收信，涨潮前送达。"}}/></div>
    </aside>
    <div className={styles.liveManuscript}><p className={styles.liveChapterMeta}>第一卷 / 第一章</p><h3>退潮</h3><div className={styles.liveTools}><span>正文</span><span>B</span><span>I</span><span>≡</span><span>“</span><span className={styles.liveToolEnd}><FilePenLine className="size-3"/>{review?"改动审阅":"写作中"}</span></div>
      <div className={styles.liveProse}><p>退潮时，周晚把账本翻到最后一页。柜台上的灯摇了一下，信纸边缘露出一道水痕。</p>
      {review?<div className={styles.liveDiff}><div><span>AI 改动 · 第 1/1 处</span><button type="button" aria-pressed={kept} onClick={()=>setKept(!kept)}>{kept?<><Check className="size-3"/>保留</>:<><RotateCcw className="size-3"/>已还原</>}</button></div>{kept?<><p><del>他感到十分不安，似乎有什么不好的事情将要发生。</del></p><p>他<mark>把同一个名字抄了两遍。第二遍，笔尖停在了最后一画。</mark></p></>:<p>他感到十分不安，似乎有什么不好的事情将要发生。</p>}</div>:<p>他把同一个名字抄了两遍。第二遍，笔尖停在了最后一画。</p>}
      <p>小满推门进来，把湿透的布袋放在柜台边上。她看见那封信，脚步停了。</p><p>「这封信，早上已经送出去了。」</p><p>周晚将两行记录并排压平。他第一次没有去看潮时，而是抬头看向门外。</p></div><div className={styles.liveManuscriptFoot}>正文与资料，各有其位。<span>由你确认每一次修改</span></div>
    </div>
    <aside className={styles.liveAssistant}><div className={styles.liveAssistantTitle}><Sparkles className="size-3.5"/>写作助手</div><p className={styles.liveUser}>重写这一章，加强悬念，也整理一下人物资料。</p><p className={styles.liveAnswer}>保留了收信场景，把人物的情绪落在具体动作上。正文和资料候选已整理好，等你确认。</p><div className={styles.liveReceipt}><p><Check className="size-3"/>待确认改动<span>正文 · 1</span></p><div><ListTree className="size-3"/>执行过程 · 5 步<ChevronDown className="size-3"/></div><div><BookOpen className="size-3"/>资料 · 周晚、小满</div><button type="button" onClick={()=>setReview(!review)}><FilePenLine className="size-3"/>{review?"返回正文预览":"在正文中审阅改动"}</button></div><div className={styles.liveComposer}><span>说说你想怎么改，@ 引用资料…</span><small><i/>自己的模型，自己的 API <span>↗</span></small></div></aside>
  </div>;
}

export function MaterialDocumentPreview() {
  return <div className={styles.materialDocument}><div className={styles.materialDocumentTop}><span><Sparkles className="size-3"/>AI 助手</span><small>角色 / 资料档案</small></div><h3>周晚</h3><p>渡口的记账人</p><div className={styles.materialDocumentTabs}><span>资料</span><span>关联与标签</span><span>选项</span></div><div className={styles.materialFacts}><div><span>身份</span><p>在晚记收信、登记与转送的记账人。</p></div><div><span>性格与行事逻辑</span><p>话少，手上有规矩。遇到异样先核对记录，心里的疑问往往比问出口的多。</p></div><div><span>目标</span><p>查清那封已经送出、却又回到柜台的信。</p></div></div><div className={styles.materialDocumentFoot}><span>资料清楚，故事才有来处。</span><span>保存</span></div></div>;
}
