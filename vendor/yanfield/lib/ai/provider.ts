import { getHarnessBridge } from "./harness-bridge";
import { discoverModelCapabilities } from "./model-capabilities";
import { thinkingProfile, thinkingParameters, type ThinkingLevel } from "./thinking";
import { openAiCachedTokens } from "./cache-usage";
import { estimateTokens } from "@/lib/ui/cn";
/**
 * Provider 适配层（服务端专用）
 * 支持：DeepSeek（OpenAI 兼容协议）/ 离线演示（demo）
 * 统一输出 ProviderChunk 流，由 engine 组装成 AiStreamEvent。
 */
import type { ModelOption, ProviderConfig } from "@/lib/types";

export class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export function redactProviderEndpoint(endpoint: string): string {
  return endpoint.replace(/([?&](?:key|api_key|token)=)[^&]*/gi, "$1[redacted]");
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
}

export interface CompletionRequest {
  provider: ProviderConfig;
  model: string;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  purpose?: "connection-test";
  /** Structured planner output only; prose generation must remain plain text. */
  outputFormat?: "json";
  disableThinking?: boolean;
  thinkingLevel?: ThinkingLevel;
  decisionTools?: {name:string;description:string;parameters:Record<string,unknown>}[];
  signal?: AbortSignal;
}

export function assertCompletionWithinWindow(request: CompletionRequest): void {
  if (request.purpose === "connection-test") return;
  const model = request.provider.models?.find((item) => item.id === request.model);
  const contextWindow = model?.contextWindow;
  if (!contextWindow || contextWindow <= 0) return;

  const inputTokens = request.messages.reduce(
    (sum, message) => sum + estimateTokens(message.content) + estimateTokens(message.reasoning_content ?? "") + 4,
    0,
  ) + (request.decisionTools?.length ? estimateTokens(JSON.stringify(request.decisionTools)) : 0);
  const outputReserve = request.maxTokens && request.maxTokens > 0
    ? request.maxTokens
    : model.maxOutputTokens ?? 4096;
  const requiredTokens = inputTokens + outputReserve;

  if (requiredTokens > contextWindow) {
    throw new ProviderError(
      `本次请求预计需要约 ${requiredTokens.toLocaleString()} tokens（输入约 ${inputTokens.toLocaleString()}，为输出预留 ${outputReserve.toLocaleString()}），超过模型「${model.label || model.id}」的 ${contextWindow.toLocaleString()} token 上下文窗口。请减少作品上下文或聊天历史、降低单次输出上限，或选择更大窗口的模型。`,
      413,
    );
  }
}

export type ProviderChunk =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "usage"; promptTokens: number; completionTokens: number; cachedInputTokens?:number; cost?:{amount:number;currency:"USD"|"CNY"} }
  | { type: "done" };

const OUTPUT_LIMIT_MESSAGE="模型输出因长度限制被截断，内容尚未完成。输出设为 0 时使用服务商默认额度，仍可能达到限制；无需为测试连接修改此设置。长篇写作可在聊天上下文或设置中提高「单次输出上限」，并检查模型的输出与上下文容量；长篇也可分章生成。已接收的内容仍保留在预览中。";

export function isOutputLimitError(error: unknown): boolean {
  return error instanceof ProviderError && error.message === OUTPUT_LIMIT_MESSAGE;
}

const DEFAULT_BASE: Record<ProviderConfig["kind"], string> = {
  deepseek: "https://api.deepseek.com",
  demo: "",
};

function trimUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function resolveBaseUrl(provider: ProviderConfig): string {
  return trimUrl(provider.baseUrl || DEFAULT_BASE[provider.kind]);
}

function joinPath(base: string, path: string): string {
  return `${trimUrl(base)}/${path.replace(/^\/+/, "")}`;
}

function authHeaders(provider: ProviderConfig): Record<string, string> {
  const key = provider.apiKey?.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/* ------------------------------ 工具函数 ------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function get(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (Array.isArray(current)) {
      const index = Number(key);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Never guess a currency: only a cost explicitly reported by the provider is trusted. */
export function reportedUsageCost(usage:Record<string,unknown>):{amount:number;currency:"USD"|"CNY"}|undefined {
  const amount=usage.cost;
  if(typeof amount!=="number"||!Number.isFinite(amount)||amount<0)return;
  const currency=usage.cost_currency??usage.currency;
  if(currency!=="USD"&&currency!=="CNY")return;
  return {amount,currency};
}

function safeJson(payload: string): unknown {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return null;
  }
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    const json = safeJson(text);
    const message = get(json, "error", "message") ?? get(json, "message") ?? get(json, "error");
    return pickString(message) || text.slice(0, 300) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** 把服务商的 HTTP 错误翻译成作者能看懂的中文提示 */
function friendlyHttpMessage(status: number, raw: string, providerName: string): string {
  const detail = raw ? `（${raw.slice(0, 180)}）` : "";
  if (status === 401 || status === 403) {
    return `${providerName} 鉴权失败（HTTP ${status}）：API Key 无效、已过期或没有该模型权限。请到「设置 → 模型服务」重新检查 Key。${detail}`;
  }
  if (status === 404) {
    return `${providerName} 返回 404：接口地址或模型 id 不存在。请检查 Base URL 是否以 /v1 结尾、模型 id 是否正确。${detail}`;
  }
  if (status === 429) {
    return `${providerName} 触发限流或额度不足（HTTP 429）：请稍后再试、降低频率，或检查账户余额。${detail}`;
  }
  if (status >= 500) {
    return `${providerName} 服务端暂时不可用（HTTP ${status}）：可以稍后重试，或换一个模型服务。${detail}`;
  }
  return `${providerName} 请求失败（HTTP ${status}）${detail}`;
}

async function httpError(response: Response, provider: ProviderConfig): Promise<ProviderError> {
  let raw = redactProviderEndpoint(await safeErrorText(response));
  const key = provider.apiKey?.trim();
  if (key) raw = raw.replaceAll(key, "[redacted]").replaceAll(encodeURIComponent(key), "[redacted]");
  return new ProviderError(friendlyHttpMessage(response.status, raw, provider.name || provider.kind), response.status);
}

/** 统一超时：默认 3 分钟上不封顶（长篇续写可能较慢），与调用方的取消信号合并 */
const DEFAULT_TIMEOUT_MS = 180000;
function withTimeout(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  if (!signal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : signal;
}

/** 推理型模型通常不接受 temperature / max_tokens 参数，直接省略避免 400 */
function isReasoningModel(model: string): boolean {
  return /^deepseek-(?:reasoner|r1)/i.test(model);
}

async function* readSse(response: Response): AsyncGenerator<string> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload) yield payload;
        }
        newline = buffer.indexOf("\n");
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith("data:")) {
      const payload = tail.slice(5).trim();
      if (payload) yield payload;
    }
  } finally {
    reader.releaseLock();
  }
}

/* ------------------------------ OpenAI 兼容 ------------------------------ */

function openAiChatUrl(provider: ProviderConfig): string {
  const base = resolveBaseUrl(provider);
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v\d+(?:beta)?$/.test(base)) return joinPath(base, "chat/completions");
  return joinPath(base, "v1/chat/completions");
}

async function* streamOpenAiCompatible(request: CompletionRequest): AsyncGenerator<ProviderChunk> {
  const { provider, model, messages, temperature, maxTokens, signal } = request;
  const reasoning = isReasoningModel(model);
  const params=thinkingParameters(provider,model,request.thinkingLevel);
  const profile=thinkingProfile(provider,model);
  const thinking=profile.adapter==="deepseek" && request.thinkingLevel!=="off" && (Object.keys(params).length>0 || request.thinkingLevel==="default");
  const response = await fetch(openAiChatUrl(provider), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(provider) },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(request.disableThinking&&!reasoning&&profile.adapter==="deepseek"&&!request.thinkingLevel?{thinking:{type:"disabled"}}:{}),
      ...(request.decisionTools?{
        tools:request.decisionTools.map(tool=>({type:"function",function:tool})),
        tool_choice:thinking?"auto":"required",
        ...(profile.adapter==="deepseek"&&!request.thinkingLevel?{thinking:{type:"disabled"}}:{})
      }:request.outputFormat === "json" ? {response_format:{type:"json_object"}} : {}),
      ...params,
      ...(reasoning
        ? {}
        : {
            temperature: temperature ?? 0.8,
            max_tokens: maxTokens && maxTokens > 0 ? maxTokens : undefined,
          }),
    }),
    signal: withTimeout(signal),
  });
  if (!response.ok) throw await httpError(response, provider);

  let outputLimited = false;
  const functionCalls=new Map<number,{name:string;arguments:string}>();
  let fallbackText="";
  for await (const payload of readSse(response)) {
    if (payload === "[DONE]") break;
    const json = safeJson(payload);
    const errorMessage = pickString(get(json, "error", "message"));
    if (errorMessage) throw new ProviderError(errorMessage);

    const choice = get(json, "choices", "0");
    if(get(choice,"finish_reason")==="length") outputLimited=true;
    const delta = asRecord(get(choice, "delta"));
    if (delta) {
      const reasoning = pickString(delta.reasoning_content) || pickString(delta.reasoning);
      if (reasoning) yield { type: "reasoning", text: reasoning };
      const text = pickString(delta.content);
      if(request.decisionTools){
        fallbackText+=text;
        if(Array.isArray(delta.tool_calls))for(const item of delta.tool_calls){
          const entry=asRecord(item),fn=asRecord(entry?.function);
          if(!entry||!fn)continue;
          const index=typeof entry.index==="number"?entry.index:0;
          const call=functionCalls.get(index)||{name:"",arguments:""};
          call.name+=pickString(fn.name);call.arguments+=pickString(fn.arguments);functionCalls.set(index,call);
        }
      }else if (text) yield { type: "delta", text };
    }
    const usage = asRecord(get(json, "usage"));
    if (usage) {
      yield {
        type: "usage",
        promptTokens: pickNumber(usage.prompt_tokens),
        completionTokens: pickNumber(usage.completion_tokens),
        ...(openAiCachedTokens(usage)!==undefined?{cachedInputTokens:openAiCachedTokens(usage)}:{}),
        ...(reportedUsageCost(usage)?{cost:reportedUsageCost(usage)}:{}),
      };
    }
  }
  if(outputLimited && request.purpose!=="connection-test") throw new ProviderError(OUTPUT_LIMIT_MESSAGE);
  if(request.decisionTools){
    if(functionCalls.size){
      const calls=[...functionCalls.entries()].sort((a,b)=>a[0]-b[0]).map(([,call])=>call);
      if(calls.some(call=>!request.decisionTools!.some(tool=>tool.name===call.name)))throw new ProviderError("模型返回了非预期的规划函数，未执行任何工具");
      const parse=(value:string):unknown=>{try{return JSON.parse(value);}catch{return value;}};
      const reply=calls.find(call=>call.name==="respond");
      const response=reply?parse(reply.arguments):null;
      const planned=calls.filter(call=>call.name!=="respond").map(call=>({name:call.name,args:parse(call.arguments)}));
      yield {type:"delta",text:JSON.stringify({message:reply?(response&&typeof response==="object"&&"message" in response?response.message:null):fallbackText,calls:planned,done:!!reply&&!planned.length})};
    }else if(fallbackText)yield {type:"delta",text:thinking?JSON.stringify({message:fallbackText,calls:[],done:true}):fallbackText};
  }
}

/* ------------------------------ 离线演示 Provider ------------------------------ */

const DEMO_PROSE_BANK: string[] = [
  "涨潮比账本上记的晚了半刻。周晚把油布账本夹在腋下，沿着湿石阶往下走，数到第三级时停住了。",
  "石阶上又多了一封信。封皮是干的，字却像刚从水里捞出来。收件人栏空着，只有一个模糊的「晚」字。",
  "「这封别登。」陈伯在跳板那头说，声音被江风削得很短，「登了，税关就有数。」",
  "周晚没应。他把信翻过来，背面没有落款，只有一道折痕，像被人折过又抚平。",
  "对岸的旧码头没有灯。小满站在船桩旁边，手里那只纸船被风掀起一角，她没有按住。",
  "他这才看清，纸船用的不是白纸，是一页从账本上裁下来的空白页。",
  "「你怕登记。」小满说。",
  "「我怕登完就送不出去。」周晚把信递到纸船边上，又收回来半寸，「涨潮之前，名字会淡。」",
  "江面上浮着几片碎桨。",
  "上游传来马蹄，一下，两下，停在税关的石堤上。他没有回头，只把账本又往里夹紧了些。",
  "风过石阶的时候，那封信的「晚」字淡了一点。",
  "再等下去，收件人就只剩一个空栏。",
];

function demoIsProse(messages: AiMessage[]): boolean {
  const joined = messages.map((m) => m.content).join("\n");
  return /职业作者|续写要求|扩写要求|润色要求|改写要求|去\s*AI\s*味|只输出正文|正文只/.test(joined);
}

function demoHash(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function demoProse(messages: AiMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const source = pickString(get(lastUser, "content"));
  const seed = demoHash(source || "yantian");
  const start = seed % DEMO_PROSE_BANK.length;
  const count = 3 + (seed % 3);
  const paragraphs: string[] = [];
  // 取连续段落，保证演示输出读起来是一段连贯的场景（而不是随机拼贴）
  for (let i = 0; i < count; i += 1) {
    paragraphs.push(DEMO_PROSE_BANK[(start + i) % DEMO_PROSE_BANK.length]);
  }
  return paragraphs.join("\n\n");
}

function demoChat(messages: AiMessage[]): string {
  const joined = messages.map((m) => m.content).join("\n");
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const raw = pickString(get(lastUser, "content"));
  // 上下文装配会把【作品】【简介】【当前章节】等块拼进同一条 user 消息，
  // 取最后一段「不像上下文标题」的文字作为真正的问题，避免把整段上下文回显给用户。
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const question = ([...lines].reverse().find((line) => !line.startsWith("【") && !line.startsWith(">")) || "")
    .replace(/^[-*\d.\s]+/, "")
    .slice(0, 80);
  const novelTitle = joined.match(/【作品】([^\n（(]{1,24})/)?.[1]?.trim() ?? "";
  const chapterMatch = joined.match(/【当前章节】[^\n]*?《([^》]{1,30})》/)?.[1]?.trim() ?? "";
  const heading = novelTitle
    ? `我先看了《${novelTitle}》${chapterMatch ? `的「${chapterMatch}」` : ""}这一章。`
    : "我先按你描述的这一章来看。";
  return [
    heading,
    "",
    `关于「${question || "这一章该怎么写"}」，我的建议分三步：`,
    "",
    "1. **先确定本章的「信息增量」**：这一章结束时，读者必须比开头多知道一件改变局势的事实。列出它，再倒推场景。",
    "2. **把冲突压到一个具体动作上**：不要写「两人气氛紧张」，写一个人把茶盏往桌上一放，水溅出来。动作比形容词更有戏剧性。",
    "3. **留钩子**：章末最后一句话最好是一个问题、一个反常的动作，或者一句没说完的话。",
    "",
    "按这个思路，你现在的开篇其实只差一个「不对劲」的细节——不用大改结构，把主角进门的第一个异常写得具体一点，读者就会跟下去。",
    "",
    "要不要我直接给这章续 600 字，或者先做一次「AI 味」诊断？",
  ].join("\n");
}

function demoCardFill(user: string): string {
  const title = user.match(/标题：\s*\n?([^\n]+)/)?.[1]?.trim() || "这条设定";
  const summary = user.match(/摘要：\s*\n?([^\n]+)/)?.[1]?.trim();
  return JSON.stringify({
    summary: summary || `${title}只写它自己的事实。`,
    content: `${title}只属于这张卡。不向作者提问，也不把其他地点展开成完整条目。`,
  });
}

function demoCodex(user: string): string {
  if (user.includes("澜国")) {
    return JSON.stringify({
      message: "建成澜国，临波州和青阳挂在下面，朔国只记相邻，陆衡进角色。",
      items: [
        { ref: "lan", op: "create", kind: "world", title: "澜国", category: "faction", summary: "西面临海的国家", content: "西面临海，北面是天山。", relation: "" },
        { ref: "linbo", op: "create", kind: "world", parentRef: "lan", title: "临波州", category: "geography", summary: "西部沿海", content: "京城周边的近海腹地。", relation: "位于" },
        { ref: "qingyang", op: "create", kind: "world", parentRef: "linbo", title: "青阳城", category: "geography", summary: "京城", content: "西距海三百里。", relation: "位于" },
        { ref: "shuo", op: "create", kind: "world", title: "朔国", category: "faction", summary: "南邻", content: "出关后的国家。", relation: "相邻" },
        { ref: "luheng", op: "create", kind: "character", name: "陆衡", role: "supporting", identity: "生长在白石镇。", personality: "" },
      ],
    });
  }
  const title = user.match(/【作者这次说】\s*\n?([^\n]{1,16})/)?.[1]?.trim() || "新设定";
  return JSON.stringify({
    message: "演示模型只建一条。换上真实模型后，会按文中的地名和人名拆开。",
    items: [{ ref: "one", op: "create", kind: "world", title, category: "custom", summary: "演示条目", content: title, relation: "" }],
  });
}

function demoCharacterFill(user: string): string {
  const name = user.match(/姓名：\s*\n?([^\n]+)/)?.[1]?.trim() || "这个人";
  return JSON.stringify({
    identity: `${name}只写这张卡上已有的身份。`,
    personality: `${name}的行事从已有选择里看，不另编经历。`,
  });
}

function demoForeshadowFill(user: string): string {
  const title = user.match(/标题：\s*\n?([^\n]+)/)?.[1]?.trim() || "这条伏笔";
  return JSON.stringify({
    description: `${title}只写它自己埋了什么、以后怎么收。`,
    notes: "不把别的线索写进这张卡。",
  });
}

function demoCompletion(messages: AiMessage[]): string {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  if (user.includes("这是资料整理")) return demoCodex(user);
  if (user.includes("这是补全当前角色卡")) return demoCharacterFill(user);
  if (user.includes("这是补全当前伏笔")) return demoForeshadowFill(user);
  if (user.includes("这是补全当前卡片")) return demoCardFill(user);
  if (/故事档案员/.test(system) && /只输出 JSON|严格 JSON|返回 JSON|JSON Schema/i.test(system)) {
    return JSON.stringify({
      chapterSummary: "本章推进了主线冲突，主角获得了新的线索，但也付出了代价。",
      characterStates: [{ name: "主角", state: "处于追踪与犹豫之间", changes: "主动迈出一步" }],
      settingStates: [{ title: "核心设定", state: "本章首次给出使用限制" }],
      ledger: [{ name: "关键资源", delta: "-1", balance: "剩余有限", note: "本章消耗一次" }],
      timeline: [{ storyTime: "当夜", event: "冲突发生，主角做出选择" }],
      foreshadows: [{ title: "旧信", status: "advanced", note: "首次被提及" }],
      conflicts: [],
    });
  }
  if (demoIsProse(messages)) return demoProse(messages);
  return demoChat(messages);
}

async function* streamDemo(request: CompletionRequest): AsyncGenerator<ProviderChunk> {
  const text = demoCompletion(request.messages);
  const chunkSize = 6;
  for (let index = 0; index < text.length; index += chunkSize) {
    if (request.signal?.aborted) return;
    yield { type: "delta", text: text.slice(index, index + chunkSize) };
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
  const promptChars = request.messages.reduce((total, message) => total + message.content.length, 0);
  yield { type: "usage", promptTokens: Math.ceil(promptChars / 2), completionTokens: Math.ceil(text.length / 2) };
}

/* ------------------------------ Harness 模型 ------------------------------ */

function harnessRoute(provider: ProviderConfig): string {
  const base = provider.baseUrl?.trim() ?? "";
  if (base.startsWith("harness:")) return base.slice("harness:".length) || "deepseek";
  return getHarnessBridge()?.providerRoute() || "deepseek";
}

function harnessMessages(messages: AiMessage[]): unknown[] {
  return messages.map((message) => ({
    id: randomId(),
    role: message.role,
    content: [{ type: "text", text: message.content }],
    source: message.role === "system"
      ? { kind: "system-prompt" }
      : message.role === "assistant"
        ? { kind: "model" }
        : { kind: "user" },
  }));
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function harnessEffort(level: ThinkingLevel | undefined): string | undefined {
  // 明确「关闭思考」时要真的发 off：否则宿主会按默认 high 思考，多花一大截输出费用。
  if (level === "off") return "off";
  if (!level || level === "default") return undefined;
  if (level === "xhigh" || level === "ultra") return "max";
  return level;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function* streamHarness(request: CompletionRequest): AsyncGenerator<ProviderChunk> {
  const bridge = getHarnessBridge();
  if (!bridge) throw new ProviderError("DeepSeek Harness 的模型服务还没有就绪", 503);
  const tools = request.decisionTools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  const input = {
    provider: harnessRoute(request.provider),
    model: request.model,
    messages: harnessMessages(request.messages),
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    reasoningEffort: harnessEffort(request.thinkingLevel),
    tools,
    signal: request.signal,
  };
  let outputLimited = false;
  const functionCalls = new Map<number, { name: string; arguments: string }>();
  let fallbackText = "";
  try {
    for await (const raw of bridge.stream(input)) {
      const chunk = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
      if (!chunk || typeof chunk.type !== "string") continue;
      if (chunk.type === "text-delta" && typeof chunk.text === "string") {
        if (request.decisionTools) fallbackText += chunk.text;
        else yield { type: "delta", text: chunk.text };
      } else if (chunk.type === "reasoning-delta" && typeof chunk.text === "string") {
        yield { type: "reasoning", text: chunk.text };
      } else if (chunk.type === "tool-call-delta") {
        const index = typeof chunk.index === "number" ? chunk.index : 0;
        const call = functionCalls.get(index) || { name: "", arguments: "" };
        if (typeof chunk.name === "string") call.name += chunk.name;
        if (typeof chunk.argumentsDelta === "string") call.arguments += chunk.argumentsDelta;
        functionCalls.set(index, call);
      } else if (chunk.type === "usage" && chunk.usage && typeof chunk.usage === "object") {
        const usage = chunk.usage as Record<string, unknown>;
        const inputTokens = numberField(usage, "inputTokens") ?? numberField(usage, "uncachedInputTokens") ?? numberField(usage, "promptTokens") ?? 0;
        const cached = numberField(usage, "cacheReadTokens") ?? numberField(usage, "cachedInputTokens") ?? 0;
        const outputTokens = numberField(usage, "outputTokens") ?? numberField(usage, "completionTokens") ?? 0;
        yield {
          type: "usage",
          promptTokens: inputTokens + cached,
          completionTokens: outputTokens,
          ...(cached > 0 ? { cachedInputTokens: cached } : {}),
        };
      } else if (chunk.type === "finish") {
        const reason = chunk.reason && typeof chunk.reason === "object" ? chunk.reason as Record<string, unknown> : null;
        if (reason?.kind === "max-tokens") outputLimited = true;
        if (reason?.kind === "error" || reason?.kind === "aborted") {
          const failure = reason.failure && typeof reason.failure === "object" ? reason.failure as Record<string, unknown> : null;
          const message = typeof failure?.message === "string" ? failure.message : "模型调用失败";
          if (reason.kind === "aborted") return;
          throw new ProviderError(message);
        }
      }
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const message = error instanceof Error ? error.message : "模型调用失败";
    if (input.reasoningEffort && /UNSUPPORTED_REASONING_EFFORT/i.test(message)) {
      yield* streamHarness({ ...request, thinkingLevel: "default" });
      return;
    }
    throw new ProviderError(message);
  }
  if (outputLimited && request.purpose !== "connection-test") throw new ProviderError(OUTPUT_LIMIT_MESSAGE);
  if (request.decisionTools) {
    if (functionCalls.size) {
      const calls = [...functionCalls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call);
      if (calls.some((call) => !request.decisionTools!.some((tool) => tool.name === call.name))) {
        throw new ProviderError("模型返回了非预期的规划函数，未执行任何工具");
      }
      const parse = (value: string): unknown => {
        try { return JSON.parse(value); } catch { return value; }
      };
      const reply = calls.find((call) => call.name === "respond");
      const response = reply ? parse(reply.arguments) : null;
      const planned = calls.filter((call) => call.name !== "respond").map((call) => ({ name: call.name, args: parse(call.arguments) }));
      const message = reply && response && typeof response === "object" && "message" in response
        ? (response as { message?: unknown }).message
        : fallbackText;
      yield { type: "delta", text: JSON.stringify({ message, calls: planned, done: Boolean(reply) && planned.length === 0 }) };
    } else if (fallbackText) {
      yield { type: "delta", text: fallbackText };
    }
  }
}

/* ------------------------------ 统一入口 ------------------------------ */

export async function* streamCompletion(request: CompletionRequest): AsyncGenerator<ProviderChunk> {
  assertCompletionWithinWindow(request);
  switch (request.provider.kind) {
    case "demo":
      yield* streamDemo(request);
      break;
    case "harness":
      yield* streamHarness(request);
      break;
    case "deepseek":
    default:
      yield* streamOpenAiCompatible(request);
      break;
  }
  yield { type: "done" };
}

/** 设置页「测试连接」：发起一次极短的补全请求 */
export async function testProvider(provider: ProviderConfig, model?: string): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  const started = Date.now();
  const targetModel = model || provider.models[0]?.id || "";
  if (!targetModel) return { ok: false, latencyMs: 0, message: "未配置模型：请先填写至少一个模型 id" };
  if (provider.kind !== "demo" && provider.kind !== "harness" && !provider.apiKey?.trim()) {
    return { ok: false, latencyMs: 0, message: "未填写 API Key" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    let received = "", responded=false;
    for await (const chunk of streamCompletion({
      provider,
      model: targetModel,
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 8,
      purpose: "connection-test",
      signal: controller.signal,
    })) {
      if (chunk.type === "delta") received += chunk.text;
      if((chunk.type==="delta"||chunk.type==="reasoning")&&chunk.text.trim() || chunk.type==="usage"&&(chunk.promptTokens>0||chunk.completionTokens>0))responded=true;
      if (received.length > 40) break;
    }
    const latencyMs = Date.now() - started;
    if(!responded)return {ok:false,latencyMs,message:"接口未返回可识别的模型响应，请检查模型和兼容协议"};
    return { ok: true, latencyMs, message: `${targetModel} 连接成功（${latencyMs}ms${received.trim() ? "，已收到返回" : ""}）` };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const raw = error instanceof Error ? error.message : "连接失败";
    const message = /aborted|abort/i.test(raw) ? "连接超时（20 秒）：检查 Base URL 与本机网络/代理" : raw;
    return { ok: false, latencyMs, message };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ 模型列表 ------------------------------ */

function uniqModels(list: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  const output: ModelOption[] = [];
  for (const item of list) {
    const id = (item.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push({ ...item, id });
  }
  return output;
}

/** 从 DeepSeek（OpenAI 兼容 /models）拉取真实模型列表 */
export async function listProviderModels(
  provider: ProviderConfig,
): Promise<{ models: ModelOption[]; endpoint: string }> {
  if (provider.kind === "demo") {
    return {
      endpoint: "demo",
      models: [
        { id: "yanfield-demo", label: "砚田演示模型（离线，无需 Key）", contextWindow: 32000 },
        { id: "yanfield-demo-prose", label: "砚田演示模型 · 正文", contextWindow: 32000 },
      ],
    };
  }
  if (provider.kind === "harness") {
    const bridge = getHarnessBridge();
    const route = harnessRoute(provider);
    const models = bridge ? await bridge.discoverModels(route) : provider.models;
    return {
      endpoint: `harness:${route}`,
      models: models.map((item) => ({ id: item.id, label: item.label, contextWindow: 1_000_000 })),
    };
  }
  const key = provider.apiKey?.trim() ?? "";
  if (!key) {
    throw new ProviderError("未填写 API Key，无法拉取模型列表", 400);
  }
  const base = resolveBaseUrl(provider);
  const url = /\/v\d+$/i.test(base) ? joinPath(base, "models") : joinPath(base, "v1/models");
  const headers: Record<string, string> = { ...authHeaders(provider) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw await httpError(response, provider);
    const payload = safeJson(await response.text());
    const models: ModelOption[] = [];

    const data = get(payload, "data");
    if (Array.isArray(data)) {
      for (const entry of data) {
        const id = pickString(get(entry, "id"));
        if (!id) continue;
        const label = pickString(get(entry, "display_name")) || pickString(get(entry, "name")) || id;
        models.push({ id, label, ...discoverModelCapabilities(entry) });
      }
    }
    const unique = uniqModels(models);
    if (!unique.length) {
      throw new ProviderError(
        "服务商返回了空模型列表：请确认 Base URL / API Key 是否正确，或手动添加模型 id",
        400,
      );
    }
    return { models: unique, endpoint: url };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const raw = error instanceof Error ? error.message : "拉取模型列表失败";
    throw new ProviderError(
      /aborted|abort/i.test(raw)
        ? "拉取模型列表超时（25 秒）：检查 Base URL 与本机网络/代理"
        : raw,
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}
