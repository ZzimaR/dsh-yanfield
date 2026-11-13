import type { TranslateValue } from "../core"

/**
 * Server-side messages returned through the API error envelope.
 *
 * Keys are the Chinese strings thrown by `new ApiError(...)` (plus the client
 * fallbacks in `lib/client/api.ts`). Route handlers render the message, the
 * client pipes it through `t()`, so the keys must match the Chinese source
 * exactly. Messages built from a template keep `{placeholder}` names that match
 * the variables at the call site.
 */
export const server: Record<string, TranslateValue> = {
  // 客户端兜底
  "请求失败（{status}）": "Request failed ({status})",
  "AI 请求失败（{status}）": "AI request failed ({status})",
  "服务端没有返回流式响应": "The server did not return a stream",

  // 请求体与通用参数
  "请求体不能为空": "The request body cannot be empty",
  "请求体必须是 JSON 对象": "The request body must be a JSON object",
  "请求体必须是对象": "The request body must be an object",
  "请求体不是合法 JSON": "The request body is not valid JSON",
  "需要 JSON 请求": "A JSON request is required",
  "不支持的操作": "Unsupported operation",
  "字段 {key} {expected}": "Field {key} {expected}",
  "{label}不能为空": "{label} cannot be empty",
  "{label}取值不合法": "{label} has an invalid value",
  "缺少查询参数 {label}": "Missing query parameter {label}",

  // AI 模型与 Provider
  "还没有可用的 AI 模型：请到「设置 → 模型」添加一个 Provider，或启用离线演示模式。":
    "No AI model is available yet. Add a provider under Settings → Models, or enable the offline demo mode.",
  "Provider 配置异常，请在设置页检查。": "The provider configuration is invalid. Check it in Settings.",
  "Provider「{name}」还没有配置模型。": "Provider “{name}” has no model configured yet.",
  "请先选择默认模型": "Select a default model first",

  // AI 请求与资料助手
  "缺少 novelId": "Missing novelId",
  "缺少 feature": "Missing feature",
  "缺少 chapterId": "Missing chapterId",
  "消息不能为空": "Message cannot be empty",
  "消息不能超过 {MAX_MESSAGE_LENGTH} 个字符": "Message cannot exceed {MAX_MESSAGE_LENGTH} characters",
  "contextText 必须是字符串": "contextText must be a string",
  "history 必须是数组": "history must be an array",
  "draft 必须是数组": "draft must be an array",
  "对话历史不能超过 {MAX_HISTORY_TURNS} 轮": "Chat history cannot exceed {MAX_HISTORY_TURNS} turns",
  "对话历史格式无效或单条内容过长": "The chat history is malformed, or one message is too long",
  "待写入卡片不能超过 {MAX_DRAFT_ITEMS} 张": "At most {MAX_DRAFT_ITEMS} cards can be staged for writing",
  "待写入卡片格式无效": "The staged cards are malformed",
  "待写入卡片内容过长，请精简后重试": "The staged cards are too long; shorten them and try again",
  "本次资料助手输入过长，请缩短对话或待写入清单":
    "This archive assistant request is too long; shorten the conversation or the staged list",

  // 余额与单价
  "余额查询超时或网络异常，请稍后刷新": "The balance check timed out or the network failed; refresh in a moment",
  "官方单价获取失败，已有单价保持不变": "Couldn't fetch official pricing; the existing prices are unchanged",

  // 导入
  "章节分割正则无效": "The chapter split pattern is invalid",
  "章节分割次数过多，请检查分割正则": "The chapter split ran too many times; check the split pattern",
  "章节数超过上限（{MAX_IMPORT_CHAPTERS}），请拆分文件后导入":
    "The chapter count exceeds the limit of {MAX_IMPORT_CHAPTERS}; split the file and import again",
  "章节数超过上限（{MAX_IMPORT_CHAPTERS}，含前言），请拆分文件后导入":
    "The chapter count exceeds the limit of {MAX_IMPORT_CHAPTERS} (preface included); split the file and import again",

  // 设置校验
  "defaultContext 必须是对象": "defaultContext must be an object",
  "defaultContext.{key} 必须是布尔值": "defaultContext.{key} must be a boolean",
  "defaultContext.{key} 必须是非负数字": "defaultContext.{key} must be a non-negative number",
  "defaultContext.customInstruction 必须是字符串": "defaultContext.customInstruction must be a string",
  "上下文预算最多 {MAX_CONTEXT_BUDGET} tokens": "The context budget is at most {MAX_CONTEXT_BUDGET} tokens",
  "单次输出上限最多 {MAX_OUTPUT_TOKENS} tokens": "The per-response output limit is at most {MAX_OUTPUT_TOKENS} tokens",
  "models 必须是对象": "models must be an object",
  "models.{role} 必须是对象": "models.{role} must be an object",
  "models.{role}.providerId 必须是字符串或 null": "models.{role}.providerId must be a string or null",
  "models.{role}.model 必须是字符串": "models.{role}.model must be a string",
  "customAgent 必须是对象": "customAgent must be an object",
  "customAgent.{key} 必须是字符串": "customAgent.{key} must be a string",
  "agentOverrides 必须是对象": "agentOverrides must be an object",
  "agentOverrides.{agentId} 不是有效的智能体 id": "agentOverrides.{agentId} is not a valid agent id",
  "agentOverrides.{agentId} 必须是对象": "agentOverrides.{agentId} must be an object",
  "agentOverrides.{agentId}.{key} 必须是字符串": "agentOverrides.{agentId}.{key} must be a string",
  "aiPricing 必须是对象": "aiPricing must be an object",
  "aiPricing.{key} 必须是 0 到 100000 之间的数字": "aiPricing.{key} must be a number from 0 to 100000",
  "modelThinking 必须是模型档位映射": "modelThinking must be a mapping from model to thinking level",
  "思考档位无效": "Invalid thinking level",
  "无法在这台机器上打开文件夹，请手动前往：{dataDir}":
    "Couldn't open the folder on this machine; go there manually: {dataDir}",

  // 作品、章节与所属关系
  "作品不存在": "Book not found",
  "章节不存在": "Chapter not found",
  "章节不属于该作品": "The chapter does not belong to this book",
  "卷不属于该作品": "The volume does not belong to this book",
  "总纲不属于该作品": "The book outline does not belong to this book",
  "会话不存在": "Conversation not found",
  "会话不属于该作品": "The conversation does not belong to this book",
  "任务不存在": "Job not found",
  "任务不属于该作品": "The job does not belong to this book",
  "任务还在运行": "The job is still running",
  "任务仍在运行": "The job is still running",
  "重试任务与会话不匹配": "The retry job does not match the conversation",
  "对象不属于该作品": "The item does not belong to this book",
  "设定父级不属于该作品": "The parent entry does not belong to this book",
  "设定父级形成循环": "The entry hierarchy forms a cycle",
  "所属卷无效": "The volume is invalid",

  // AI 可用的资料
  "这张资料已对 AI 隐藏": "This entry is hidden from the AI",
  "这张资料尚未在当前章节揭示；如确需使用，请在本轮明确引用":
    "This entry has not been revealed in the current chapter; to use it anyway, cite it explicitly in this turn",
  "这张资料已有待确认的删除；如需改为修改，请先丢弃删除候选":
    "This entry already has a pending deletion; to edit it instead, discard the deletion candidate first",
  "该引用只可用于新章的章纲": "This reference can only be used for a new chapter's outline",

  // 改动审阅与套用
  "新建对象需要名称": "A new item needs a name",
  "新建对象必须保留名称字段": "A new item must keep the name field",
  "请指定所属章节、卷或作品": "Specify the chapter, volume, or book it belongs to",
  "要修改的对象不存在": "The item to edit does not exist",
  "内容没有变化": "Nothing changed",
  "只能删除角色、设定或伏笔条目；正文与大纲请用修改":
    "Only characters, entries, and foreshadowing items can be deleted; use Edit for body text and outlines",
  "要删除的资料不存在": "The entry to delete does not exist",
  "「{title}」下还有子设定（{names}），请先删除或移走子设定":
    "“{title}” still has sub-entries ({names}); delete or move them first",
  "「{title}」已重新存在，不能重复恢复": "“{title}” exists again and cannot be restored twice",
  "「{title}」的父级设定已不存在，不能恢复": "The parent entry for “{title}” no longer exists, so it cannot be restored",
  "「{name}」已存在，请修改已有资料": "“{name}” already exists; edit the existing entry",
  "章节标题或序号已被占用": "That chapter title or number is already taken",
  "改动重复": "Duplicate change",
  "改动不存在": "Change not found",
  "改动选择无效": "The change selection is invalid",
  "待确认改动不存在": "That pending change does not exist",
  "这项改动已结束": "This change is already finished",
  "请先应用新章，再应用它的章纲": "Apply the new chapter first, then its outline",
  "「{title}」已经不存在，无需再删除": "“{title}” no longer exists; there is nothing to delete",
  "「{title}」在生成后已有修改，请核对后重新生成":
    "“{title}” has changed since it was generated; review it and generate again",
  "「{title}」已有后续修改，不能覆盖撤回": "“{title}” has later edits and cannot be overwritten by an undo",
  "新章已有后续关联资料，请先处理关联后再撤回":
    "The new chapter already has linked content; clear those links before undoing",
  "新设定已有子级，不能撤回": "The new entry has sub-entries and cannot be undone",
  "角色已有关系，不能撤回": "The character has relationships and cannot be undone",
  "只有正文支持逐块审阅": "Only body text can be reviewed block by block",
  "正文改动位置无效": "The body edit location is invalid",
  "请至少保留一处改动": "Keep at least one change",
  "所选字段无效": "The selected fields are invalid",
  "actions 必须是数组": "Actions must be an array",
  "characterArcs 格式不正确": "Character arcs are malformed",
  "feature 不能为空": "Feature is required",
  "format 仅支持 md 或 txt": "Format must be md or txt",
  "limit 必须是 1 到 100 之间的整数": "Limit must be an integer from 1 to 100",
  "models 格式不正确，应为 [{ id, label }] 数组": "Models are malformed; expected an array of id/label objects",
  "relations 格式不正确": "Relations are malformed",
  "role 必须是 user 或 assistant": "Role must be user or assistant",
  "scenes 必须是数组": "Scenes must be an array",
  "scope 仅支持 book、volume 或 chapter": "Scope must be book, volume, or chapter",
  "usage 必须是对象或 null": "Usage must be an object or null",
  "不支持的服务类型": "Unsupported service type",
  "伏笔不存在": "Foreshadowing not found",
  "伏笔标题不能为空": "Foreshadowing title is required",
  "会话标题不能为空": "Conversation title is required",
  "作品标题不能为空": "Book title is required",
  "内置预设不可删除，可通过 PATCH 停用": "Built-in presets cannot be deleted; disable them with PATCH instead",
  "卷不存在": "Volume not found",
  "卷不存在或不属于该作品": "Volume not found in this book",
  "卷标题不能为空": "Volume title is required",
  "回收章节不存在或不属于该作品": "Payoff chapter not found in this book",
  "埋设章节不存在或不属于该作品": "Setup chapter not found in this book",
  "文件内容为空": "The file is empty",
  "文件过大，最大支持 20MB": "File too large; the maximum is 20 MB",
  "服务名称不能为空": "Service name is required",
  "未识别到任何章节": "No chapters were detected",
  "档案不存在": "Archive entry not found",
  "模型服务不存在": "Model service not found",
  "没有可更新的字段": "No fields to update",
  "没有可更新的设置字段": "No settings fields to update",
  "消息不存在": "Message not found",
  "消息分页游标无效": "Invalid message page cursor",
  "父级设定不存在或不属于该作品": "Parent entry not found in this book",
  "父级设定不能是自身": "An entry cannot be its own parent",
  "示例作品创建失败": "Failed to create the sample book",
  "章节不存在或不属于该作品": "Chapter not found in this book",
  "章节标题不能为空": "Chapter title is required",
  "缺少 file 字段": "Missing file field",
  "缺少查询参数 novelId": "Missing query parameter novelId",
  "缺少查询参数 novelId 或 chapterId": "Missing query parameter novelId or chapterId",
  "表单解析失败": "Failed to parse the form",
  "角色不存在": "Character not found",
  "角色名不能为空": "Character name is required",
  "设定不存在": "Entry not found",
  "设定标题不能为空": "Entry title is required",
  "请使用 multipart/form-data 上传 txt 文件（字段名 file）": "Upload the txt file as multipart/form-data (field name: file)",
  "请先填写 API Key，再拉取模型列表": "Add an API key before fetching the model list",
  "资料已有新修改，请重新打开并核对后保存": "This entry changed elsewhere; reopen it, review, and save again",
  "预设不存在": "Preset not found",
  "预设名称不能为空": "Preset name is required",
}
