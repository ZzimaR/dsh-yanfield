import type { TranslateValue } from "../core"

/** Archives copy: chapter archives, manual editor, novel overview and block diff. */
export const archives: Record<string, TranslateValue> = {
  // 档案详情
  "没有关联章节，无法重新提取": "No linked chapter to re-extract",
  "档案已更新，保留了你的手动修改": "Archive updated; your manual edits were kept",
  "有 {count} 处档案与正文不一致，已列入「待确认冲突」。如果你的校订是对的，记得同步修改正文。":
    "{count} archive entries no longer match the manuscript and are listed under \"Conflicts to review\". If your correction is right, update the manuscript to match.",
  "只补充了正文里新增的事实。": "Only new facts from the manuscript were added.",
  "档案已重新提取": "Archive re-extracted",
  "重新提取失败": "Couldn't re-extract the archive",
  "提取档案时发生错误": "Something went wrong while extracting the archive",
  "本章档案已删除": "Chapter archive deleted",
  "删除档案失败": "Couldn't delete the archive",
  "已标记：保留档案记录": "Marked: keeping the archive record",
  "已标记：改为以正文为准": "Marked: following the manuscript",
  "档案会保留这条记录。请同步修改正文，让正文与档案一致；之后重新提取也不会覆盖你手动改过的内容。":
    "The archive keeps this entry. Update the manuscript to match it; re-extracting later won't overwrite what you edited by hand.",
  "请点「编辑」改正档案里的这一条。手动改过的档案在重新提取时会被保留，所以只改正文不会自动纠正它。":
    "Click \"Edit\" to fix this entry in the archive. Hand-edited archives survive re-extraction, so changing only the manuscript won't correct it automatically.",
  "第 {n} 章": "Chapter {n}",
  "{words} 正文": "{words} words",
  "AI 提取": "AI-extracted",
  "手动维护": "Maintained by hand",
  "更新于 {time}": "Updated {time}",
  "重新提取": "Re-extract",
  "你手动校订过这份档案。重新提取会保留你的修改，只补充正文里新增的事实；如果你改的是事实（比如人数、物品、时间），请同步修改正文，否则会被列为「待确认冲突」，后续章节的 AI 也可能读到前后矛盾的信息。":
    "You've edited this archive by hand. Re-extracting keeps your changes and adds only new facts from the manuscript. If you changed a fact (a headcount, an item, a time), update the manuscript too—otherwise it's listed under \"Conflicts to review\", and later chapters' AI may read contradictory details.",
  "本章正文在此档案生成后被修改过，档案可能已过期。建议重新提取，避免后续章节沿用旧事实。":
    "The manuscript changed after this archive was generated, so it may be out of date. Re-extract it so later chapters don't carry stale facts.",
  "待确认冲突 {count} 项": { one: "{count} conflict to review", other: "{count} conflicts to review" },
  "档案与正文表述不一致，需要人来裁决，AI 不自行取舍。":
    "The archive and the manuscript disagree. A person decides; the AI won't choose for you.",
  "查看处理方式": "See how to resolve",
  "未命名冲突": "Untitled conflict",

  // 本章 / 角色 / 设定 / 总账 / 时间线
  "本章档案": "Chapter archive",
  "只记录正文里写过的事，不补推断。": "Only what the manuscript states—no inferences.",
  "本章还没有事实摘要。": "No fact summary for this chapter yet.",
  "角色档案": "Character archive",
  "角色名 · 本章结束时的状态 · 本章发生的变化": "Character · state at chapter end · what changed",
  "本章没有角色状态记录。": "No character states recorded for this chapter.",
  "未命名角色": "Unnamed character",
  "状态未记录": "State not recorded",
  "变化：{changes}": "Changes: {changes}",
  "设定档案": "Codex archive",
  "设定名 · 本章被推进或改变的部分": "Codex entry · what this chapter advanced or changed",
  "本章没有设定变动记录。": "No setting changes recorded for this chapter.",
  "未命名设定": "Untitled setting",
  "人物总账": "Character ledger",
  "人情、债务、代价的收支与结余": "Favors, debts, and costs: what came in, went out, and remains",
  "本章没有账目变化。": "No ledger changes for this chapter.",
  "项目": "Item",
  "变化": "Change",
  "结余": "Balance",
  "时间线": "Timeline",
  "故事内时间 · 发生的事": "Story time · what happened",
  "本章没有时间线记录。": "No timeline entries for this chapter.",
  "伏笔状态": "Foreshadowing status",
  "本章涉及的伏笔与推进情况": "Foreshadowing touched in this chapter and how far it moved",

  // 删除 / 冲突处理
  "删除本章档案？": "Delete this chapter's archive?",
  "「{title}」的档案会被删除，正文不会受影响。此操作不可撤销。":
    "The archive for \"{title}\" will be deleted. The manuscript is untouched. This can't be undone.",
  "冲突处理方式": "Handling conflicts",
  "档案与正文冲突时，程序不替你做判断。两种处理方式都只做登记，不会自动改稿：":
    "When the archive and the manuscript disagree, the app doesn't decide for you. Both options only record a choice—neither rewrites anything:",
  "保留档案记录": "Keep the archive record",
  "认定档案是对的：后续按档案事实继续写，回头再决定是否修正正文。":
    "Treat the archive as right: keep writing from its facts and decide later whether to fix the manuscript.",
  "改为以正文依据": "Follow the manuscript instead",
  "认定正文是对的：请手动编辑档案，或改完正文后重新提取，让档案与正文一致。":
    "Treat the manuscript as right: edit the archive by hand, or fix the manuscript and re-extract so the two match.",
  "当前版本冲突项只做红色标记与说明，档案数据始终以接口返回为准。":
    "In this version, conflicts are only flagged in red with an explanation; archive data always follows the API response.",

  // 手动编辑
  "删除这一行": "Delete this row",
  "档案已更新": "Archive updated",
  "重新提取时会保留你的修改。如果改的是事实，记得同步修改正文，让两边保持一致。":
    "Re-extracting keeps your edits. If you changed a fact, update the manuscript too so both stay in sync.",
  "保存档案失败": "Couldn't save the archive",
  "手动编辑本章档案": "Edit this chapter's archive",
  "保存档案": "Save archive",
  "没有可编辑的档案。": "There's no archive to edit.",
  "手动修正只改档案本身，不会改动正文；保存后该章档案不再标记为过期。":
    "Manual edits change only the archive, never the manuscript. After saving, this chapter's archive is no longer marked as out of date.",
  "本章档案（事实摘要）": "Chapter archive (fact summary)",
  "只记录正文里写过的事实，不要补充推断。":
    "Record only facts stated in the manuscript; don't add inferences.",
  "角色名": "Character",
  "位置/伤势/心态": "Location / injuries / state of mind",
  "本章发生了什么": "What happened in this chapter",
  "添加角色状态": "Add character state",
  "设定名": "Codex entry",
  "本章状态": "Status this chapter",
  "添加设定状态": "Add setting state",
  "项目 · 本章变化 · 结余 · 备注（如渡钱、人情债）":
    "Item · change this chapter · balance · notes (e.g. passage fare, a debt of honor)",
  "添加账目": "Add ledger entry",
  "时间点": "Time",
  "如：入夜后两刻": "e.g. two quarters after nightfall",
  "事件": "Event",
  "添加时间线": "Add timeline entry",
  "伏笔": "Foreshadowing",
  "伏笔 · 本章状态 · 说明": "Foreshadowing · status this chapter · notes",
  "添加伏笔记录": "Add foreshadowing entry",
  "本章没有伏笔记录。": "No foreshadowing recorded for this chapter.",
  "待确认冲突": "Conflicts to review",
  "主题 · 冲突说明；保存后仍以 API 数据为准。":
    "Topic · conflict details; saved data still follows the API.",
  "冲突主题": "Conflict topic",
  "添加冲突项": "Add conflict",
  "本章没有待确认冲突。": "No conflicts to review for this chapter.",

  // 作品概览
  "未分卷": "Unassigned",
  "作品不存在或已被删除": "This work doesn't exist or was deleted",
  "检查一下书架，这本书也许已经被移除了。": "Check your library—the book may have been removed.",
  "最近更新 {time}": "Updated {time}",
  "还没有写简介。点右侧「编辑信息」补上一句话，让书架更有存在感。":
    "No summary yet. Click \"Edit details\" on the right to add a line and give it more presence in your library.",
  "导出全书": "Export whole book",
  "打开编辑器": "Open editor",
  "目录加载失败：{error}": "Couldn't load the table of contents: {error}",
  "写作目标": "Writing goal",
  "调整": "Adjust",
  "{current} / {goal} 字": "{current} / {goal} words",
  "尚未设置目标字数（在编辑信息里补充）": "No word goal set (add one in Edit details)",
  "开始创作": "Started",
  "平均章长": "Average chapter length",
  "故事档案": "Story archive",
  "查看": "View",
  "最新档案": "Up to date",
  "待更新": "Needs update",
  "待提取": "Not extracted",
  "写完一章就提取一次档案，角色状态与数值总账不会走丢。":
    "Extract an archive after each chapter so character states and ledger numbers don't get lost.",

  // 块级 diff
  "接受第 {n} 块改动": "Accept change in block {n}",
  "第 {n} 块": "Block {n}",
  "{count} 字": { one: "{count} character", other: "{count} characters" },
  "（空段落）": "(empty paragraph)",
  "（无内容）": "(no content)",
  "共 {count} 块改动": { one: "{count} changed block", other: "{count} changed blocks" },
  "新增 {count} 处": "{count} added",
  "删除 {count} 处": "{count} removed",
  "修改 {count} 处": "{count} changed",
  "全不选": "Clear all",
  "没有可审阅的改动": "No changes to review",
  "AI 输出与当前正文一致，无需应用。":
    "The AI output matches the current manuscript, so there's nothing to apply.",
  "当前页面没有可写入的编辑器": "No writable editor on this page",
  "改动预览": "Change preview",
  "已选 {selected} / {total} 块": "{selected} of {total} blocks selected",
  "应用到正文（接受 {count} 项）": "Apply to manuscript ({count} selected)",
  "将应用已勾选的 {count} 项改动，未勾选的保持原样": {
    one: "Applies the {count} selected change; unchecked blocks stay as they are.",
    other: "Applies the {count} selected changes; unchecked blocks stay as they are.",
  },
  "逐块审阅 AI 改动": "Review AI changes block by block",
  "AI 改动了 {count} 块内容，请逐块确认；只有勾选的块会被写入正文。": {
    one: "The AI changed {count} block. Review it and check the blocks you want; only checked blocks are written to the manuscript.",
    other:
      "The AI changed {count} blocks. Review them and check the ones you want; only checked blocks are written to the manuscript.",
  },
}
