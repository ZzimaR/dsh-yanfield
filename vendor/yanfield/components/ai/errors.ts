"use client";

/**
 * AI 错误可读化：把 Provider / 网络 / 配额等原始错误翻译成作者能看懂、能操作的中文提示。
 *
 * 输入可能是：
 * - SSE error 事件（{ type: "error", message, code }，code 为 provider / request / aborted / unknown）
 * - fetch 抛出的 ApiError（带 HTTP status）
 * - ProviderError 的原始文案（多为英文，如 "Invalid API key"、"fetch failed"、"model not found"）
 * 输出统一为 { title, hint, action? }，聊天气泡与 AI 任务弹层共用。
 */

export interface AiErrorInfo {
  /** 一句话说明发生了什么 */
  title: string;
  /** 可操作建议（去哪检查、怎么重试） */
  hint: string;
  /** 需要引导到设置页处理 */
  action?: "settings-models";
}

const SETTINGS_LABEL = "设置 → 模型服务";

/** 401 / 403 / 404 / 429 / 5xx 等状态码：优先从文案里再兜一层 */
function extractStatus(message: string): number | undefined {
  const match = /(?:^|[^0-9])([45][0-9]{2})(?:[^0-9]|$)/.exec(message);
  if (!match) return undefined;
  const status = Number(match[1]);
  return Number.isFinite(status) ? status : undefined;
}

/** 中文文案里明确提到「没有可用模型 / Provider 未配置」 */
const NO_PROVIDER_RE =
  /还没有可用的\s*ai\s*模型|没有可用.*provider|provider\s*配置异常|还没有配置模型|未配置.*模型|no\s+available\s+model|no\s+provider/i;
const AUTH_RE = /401|unauthorized|invalid\s*api\s*key|incorrect\s*api\s*key|api\s*key.*(无效|错误|失效)|invalid_api_key|authentication\s*error|认证失败|密钥.*(无效|错误|过期)/i;
const FORBIDDEN_RE = /403|forbidden|permission\s*denied|insufficient\s*permission|无权|没有权限|访问被拒/i;
const NOT_FOUND_RE = /404|not\s*found|model.*(不存在|未找到|not\s*found)|no\s*such\s*model|unknown\s*model|模型不存在/i;
const RATE_RE =
  /429|rate\s*limit|too\s*many\s*requests|insufficient_quota|quota\s*exceeded|余额不足|配额不足|限流|请求过于频繁/i;
const TIMEOUT_RE = /timeout|timed\s*out|etimedout|deadline\s*exceeded|请求超时|连接超时/i;
const CONNECT_RE =
  /enotfound|econnrefused|econnreset|epipe|fetch\s*failed|failed\s*to\s*fetch|network\s*error|getaddrinfo|socket\s*hang\s*up|连接失败|无法连接|连接被拒绝|base\s*url.*(错误|无效|不正确)/i;
const CONTEXT_RE =
  /context\s*length|context_length|maximum\s*context|too\s*many\s*tokens|token\s*limit|上下文.*(超|过长|长度)|超过.*上下文/i;

/**
 * 错误 → 中文可操作提示。
 * @param raw SSE error.message / Error.message / 任意错误对象
 * @param options.status ApiError 的 HTTP 状态码（有则优先按状态码判断）
 */
export function humanizeAiError(raw: unknown, options?: { status?: number; code?: string }): AiErrorInfo {
  const message =
    typeof raw === "string"
      ? raw.trim()
      : raw instanceof Error
        ? raw.message.trim()
        : raw === null || raw === undefined
          ? ""
          : String(raw).trim();
  if(message.includes("模型输出因长度限制被截断")) return {
    title:"输出达到长度限制，内容未完成",
    hint:"已收到的内容仍保留。请在聊天上下文或设置中提高单次输出上限，并检查模型容量；也可分章生成。",
  };
  const status = options?.status ?? extractStatus(message);
  const settingsAction = { action: "settings-models" as const };

  if (NO_PROVIDER_RE.test(message)) {
    return {
      title: "还没有可用的 AI 模型",
      hint: `请到「${SETTINGS_LABEL}」添加一个 Provider（或启用离线演示模式），保存后即可对话。`,
      ...settingsAction,
    };
  }

  if (status === 401 || AUTH_RE.test(message)) {
    return {
      title: "API Key 无效或已过期",
      hint: `请到「${SETTINGS_LABEL}」检查该 Provider 的 API Key 是否填写正确、是否需要重新生成。`,
      ...settingsAction,
    };
  }

  if (status === 403 || FORBIDDEN_RE.test(message)) {
    return {
      title: "该 API Key 没有访问权限（403）",
      hint: `当前 Key 无权使用所选模型，请在「${SETTINGS_LABEL}」更换 Key 或模型后重试。`,
      ...settingsAction,
    };
  }

  if (status === 404 || NOT_FOUND_RE.test(message)) {
    return {
      title: "接口或模型不存在（404）",
      hint: `请检查「${SETTINGS_LABEL}」里的 Base URL（官方地址为 https://api.deepseek.com）与模型名；也可以先拉取账户可用的模型列表。`,
      ...settingsAction,
    };
  }

  if (status === 429 || RATE_RE.test(message)) {
    return {
      title: "请求过于频繁或配额不足（429）",
      hint: `已触发服务商限流或额度限制：请稍后重试，或到「${SETTINGS_LABEL}」更换模型 / Key。`,
      ...settingsAction,
    };
  }

  if (CONTEXT_RE.test(message)) {
    return {
      title: "请求超出模型上下文长度",
      hint: "请打开上下文抽屉调低「上下文预算」、关掉暂时用不到的分节后重试。",
    };
  }

  if (TIMEOUT_RE.test(message)) {
    return {
      title: "请求超时",
      hint: `网络或代理不稳定，请稍后重试；若持续超时，请检查「${SETTINGS_LABEL}」的 Base URL 是否可访问。`,
      ...settingsAction,
    };
  }

  if (CONNECT_RE.test(message)) {
    return {
      title: "无法连接到模型服务",
      hint: `请检查网络 / 代理与「${SETTINGS_LABEL}」的 Base URL（官方地址为 https://api.deepseek.com）及 API Key 是否有效。`,
      ...settingsAction,
    };
  }

  if (typeof status === "number" && status >= 500) {
    return {
      title: `模型服务暂时不可用（${status}）`,
      hint: "服务商可能正在维护，请稍后重试；若持续失败请检查 Provider 配置。",
    };
  }

  if (!message) {
    return {
      title: "AI 请求失败",
      hint: `请稍后重试；若持续失败，请到「${SETTINGS_LABEL}」检查 Provider、API Key 与模型名。`,
      ...settingsAction,
    };
  }

  // 原始文案已是中文（多半来自后端 ApiError）→ 直接展示，并给出通用排查建议
  if (/[\u4e00-\u9fa5]/.test(message)) {
    return {
      title: message,
      hint: `可稍后重试；若持续失败，请到「${SETTINGS_LABEL}」检查 Provider、API Key 与模型名。`,
      ...settingsAction,
    };
  }

  // 兜底：英文服务商报错不直出给作者
  return {
    title: "模型服务返回错误",
    hint: `请稍后重试；若持续失败，请到「${SETTINGS_LABEL}」检查 Provider、API Key、Base URL 与模型名。`,
    ...settingsAction,
  };
}
