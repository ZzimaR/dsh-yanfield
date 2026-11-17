export function requestedChapterTool(message: string) {
  const prefix = /^([^:\n：]+)[:：]/.exec(message.trimStart())?.[1].trim().toLowerCase()
  switch (prefix) {
    case "拆章":
    case "split chapter":
      return "split_chapter"
    case "移动章节":
    case "move chapter":
      return "move_chapter"
    case "重命名章节":
    case "rename chapter":
      return "rename_chapter"
    case "删除章节":
    case "delete chapter":
      return "delete_chapter"
    case "合并章节":
    case "merge chapters":
      return "merge_chapters"
    case "跨章移动段落":
    case "move paragraphs between chapters":
      return "move_chapter_blocks"
  }
}
