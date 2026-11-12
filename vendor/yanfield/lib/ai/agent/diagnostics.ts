import type {AgentDiagnostic} from "./types";
export function redactDiagnostic(text:string):string {
  return text.replace(/sk-[a-zA-Z0-9_-]{8,}/g,"[REDACTED_KEY]").replace(/Bearer\s+[^\s"'<>]+/gi,"Bearer [REDACTED]").replace(/(["']?(?:api[_-]?key|authorization|access[_-]?token)["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi,"$1[REDACTED]");
}
export function protocolDiagnostic(raw:string,json:unknown,issues:{path:PropertyKey[];code:string;message:string}[],round:number,attempt:number):AgentDiagnostic {
  const safe=redactDiagnostic(raw);
  return {code:json===null?"AGENT_JSON_INVALID":"AGENT_SCHEMA_INVALID",stage:"decision",round,attempt,responseChars:raw.length,
    issues:issues.map(i=>({path:i.path.map(String).join(".")||"$",code:i.code,message:redactDiagnostic(i.message)})),
    responsePreview:safe.slice(0,4000),...(safe.length>4000?{responseTail:safe.slice(-1000)}:{}),createdAt:new Date().toISOString()};
}
