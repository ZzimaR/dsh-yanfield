import type { ModelOption, ModelThinkingCapability, ThinkingEffort } from "@/lib/types";
import { THINKING_EFFORTS } from "./thinking";
const object = (value:unknown):Record<string,unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : {};
const positive = (value:unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
const efforts = (value:unknown):ThinkingEffort[] | undefined => Array.isArray(value) ? [...new Set(value.filter((v):v is ThinkingEffort => typeof v === "string" && THINKING_EFFORTS.includes(v as ThinkingEffort)))] : undefined;
const effort = (value:unknown) => typeof value === "string" && THINKING_EFFORTS.includes(value as ThinkingEffort) ? value as ThinkingEffort : undefined;
/**
 * Normalize documented DeepSeek / OpenAI-compatible discovery fields,
 * preserving the difference between "unknown" and "explicitly unsupported".
 */
export function discoverModelCapabilities(raw:unknown):Partial<ModelOption> {
  const row=object(raw), result:Partial<ModelOption>={};
  const context=positive(row.context_window) ?? positive(row.context_length) ?? positive(row.max_input_tokens);
  const output=positive(row.max_output_tokens) ?? positive(row.max_tokens);
  if(context)result.contextWindow=context;
  if(output)result.maxOutputTokens=output;
  if(Array.isArray(row.supported_parameters))result.supportedParameters=row.supported_parameters.filter((v):v is string=>typeof v === "string" && v.length<128).slice(0,100);
  let thinking:ModelThinkingCapability|undefined;
  const control=object(row.effort), reasoning=object(row.reasoning);
  if(Array.isArray(control.supported_levels)) {
    // DeepSeek 官方 /models 返回 effort.supported_levels；思考模式可用 thinking.type 开关。
    thinking={supported:true,format:"deepseek",levels:efforts(control.supported_levels),defaultLevel:effort(control.default_level),canDisable:true};
  } else if(Array.isArray(reasoning.supported_efforts)) {
    thinking={supported:true,format:"deepseek",levels:efforts(reasoning.supported_efforts),defaultLevel:effort(reasoning.default_effort)};
    if(typeof reasoning.mandatory === "boolean")thinking.canDisable=!reasoning.mandatory;
  } else if(result.supportedParameters?.includes("reasoning")) {
    thinking={supported:true};
  }
  if(thinking)result.thinking=thinking;
  return result;
}
