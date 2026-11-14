import { extractJson } from "@/lib/ai/prompts";
import { terminalReply } from "./reply";

/** Normalize the observed DeepSeek tool envelope; the caller still validates every tool and argument. */
export function parseAgentDecision(raw: string): unknown {
  const json=extractJson(raw);
  if(json!==null && (!raw.includes("DSML") || (typeof json==="object" && "calls" in json))) {
    const reply=terminalReply(json);
    return reply===undefined?json:{message:reply,calls:[],done:true};
  }
  const marker="｜{1,2}DSML｜{1,2}";
  const envelope=new RegExp(`^([\\s\\S]*?)<${marker} calls>([\\s\\S]*?)<\\/${marker} calls>\\s*$`).exec(raw);
  if(!envelope)return null;
  const invoke=new RegExp(`<${marker} invoke name="([^"<>]+)">([\\s\\S]*?)<\\/${marker} invoke>`,"g");
  const parameter=new RegExp(`^\\s*<${marker} parameter name="args" string="false">([\\s\\S]*?)<\\/${marker} parameter>\\s*$`);
  const calls: {name:string;args:unknown}[]=[];
  let cursor=0;
  for(const match of envelope[2].matchAll(invoke)) {
    if(envelope[2].slice(cursor,match.index).trim())return null;
    const args=parameter.exec(match[2]);
    if(!args)return null;
    try {calls.push({name:match[1],args:JSON.parse(args[1])});}catch{return null;}
    cursor=(match.index??0)+match[0].length;
  }
  if(!calls.length||envelope[2].slice(cursor).trim())return null;
  const reply=terminalReply({calls});
  return reply===undefined?{message:envelope[1].trim(),calls,done:false}:{message:reply,calls:[],done:true};
}

/** DeepSeek 官方兼容接口支持 response_format=json_object；离线演示不参与规划。 */
export function supportsDecisionJson(provider: {kind:string;baseUrl:string}, _model:string): boolean {
  return provider.kind==="deepseek";
}

const str={type:"string"};
const kind={type:"string",enum:["chapter","blueprint","character","world","location","foreshadow","outline","volume-outline"]};
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[])=>({name,description,parameters:{type:"object",properties,required,additionalProperties:false}});
export const DECISION_TOOLS=[
  tool("workspace","读取作品基本信息、卷章和资料目录",{}),
  tool("list","分页查找资料目录",{kind,query:str,offset:{type:"integer"},limit:{type:"integer"}},["kind"]),
  tool("read","读取指定对象，优先读取候选。章纲使用章节 ID。正文回执的 nextOffset 是下一页起点",{kind,id:str,offset:{type:"integer"},limit:{type:"integer"}},["kind","id"]),
  tool("propose","修改前先读原卡，保留未授权删除的已知事实；不增加不等于删除。暂存新建或修改，等待作者确认",{kind,id:str,fields:{type:"object",additionalProperties:true},reason:str,title:str},["kind","fields","reason"]),
  tool("delete","删除整条角色、地点、设定或伏笔。仅在作者明确要求删除或确认合并/重复时使用；先read目标，删除也需作者确认",{kind:{type:"string",enum:["character","world","location","foreshadow"]},id:str,reason:str},["kind","id","reason"]),
  tool("write_chapter","准备正文候选。局部修改用 patch 和逐字引用的原句；整章起草或明确重写才用 rewrite",{id:str,title:str,volumeId:{type:["string","null"]},instruction:str,words:{type:"integer"},mode:{type:"string",enum:["rewrite","append","selection","patch"]},edits:{type:"array",items:{type:"object",properties:{original:str,replacement:str},required:["original","replacement"],additionalProperties:false}}},["instruction"]),
  tool("reject_change","丢弃本轮候选",{changeId:str},["changeId"]),
  tool("read_archive","读取章节档案",{chapterId:str},["chapterId"]),
  tool("respond","用自然语言回答作者。讨论时直接给结论和理由，提交候选时说明具体改了什么、为什么这样改，以及确实需要作者判断的地方。依据工具回执区分待审阅和已保存，不输出内部 ID。",{message:{...str,minLength:1}},["message"])
];
export function nativeDecisionSystem(system:string):string {
  return system.replace(/^每轮最多12个工具调用[^\n]+/m,"通过声明的原生函数推进任务，不在回复里书写JSON或DSML/XML工具标签。每轮最多12个调用。完成、普通讨论或需要作者确认时调用respond；其他工具结果返回后继续执行。");
}
/**
 * DeepSeek 原生工具（function calling）在思考模式下同样可用；离线演示走文本回退。
 * harness 走 DSH 的 llm.stream，tools 会被透传到底层适配器（host 侧 streamHarness 解析
 * tool-call-delta），所以同样能走原生工具，不再退回易碎的 DSML 文本协议。
 */
export function usesDecisionTool(provider:{kind:string;baseUrl:string},_model:string):boolean {
  return provider.kind==="deepseek"||provider.kind==="harness";
}
