"use client";
import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import styles from "./PublicIntro.module.css";

/** Local interaction only: no model request or manuscript write. */
export function LandingReview() {
  const [kept,setKept]=useState(true);
  return <div className={styles.reviewDemo}>
    <div className={styles.reviewTitle}><span>第一章 · 退潮</span><span>修改预览</span></div>
    <div className={styles.reviewBody}><p>退潮时，周晚又翻开了那本账。</p><div className={styles.changeLabel}><span>AI 改动 / 01</span><div><button type="button" aria-pressed={kept} onClick={()=>setKept(true)} className={kept?styles.kept:""}><Check className="size-3"/>保留</button><button type="button" aria-pressed={!kept} onClick={()=>setKept(false)}><RotateCcw className="size-3"/>还原</button></div></div>
    {kept?<><p className={styles.oldText}>他<del>感到十分不安，似乎有什么不好的事情将要发生。</del></p><p className={styles.newText}>他<mark>把同一个名字抄了两遍。第二遍，笔尖停在了最后一画。</mark></p></>:<p className={styles.restoredText}>他感到十分不安，似乎有什么不好的事情将要发生。</p>}
    <p>门外有人敲了三下。他没有应声。</p></div>
    <div className={styles.reviewBottom}><span className={styles.reviewDot}/>{kept?"这一处，按你的选择保留":"这一处，已恢复原文"}<span>交互示例</span></div>
  </div>;
}
