import { ApiError, handle, ok } from "@/lib/api-utils";
import { readBody, requireQueryParam } from "@/app/api/_lib/http";
import { sseResponse, linkedSignal } from "../sse";
import { runAgent } from "@/lib/ai/agent/run";
import { listRuns } from "@/lib/ai/agent/store";
import type { AgentRequest } from "@/lib/ai/agent/types";
import { z } from "zod";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=handle(async request=>ok({items:listRuns(requireQueryParam(request,"novelId","作品"))}));
export const POST=handle(async request=>{
  const body=await readBody(request);
  const params=z.object({
    sessionId:z.string().optional(),agentId:z.string().optional(),
    novelId:z.string().min(1), chapterId:z.string().nullable().optional(), message:z.string().trim().min(1).max(60000),
    history:z.array(z.object({role:z.enum(["user","assistant"]),content:z.string().max(100000)})).max(50).optional(),
    snapshot:z.object({kind:z.enum(["world","character","foreshadow"]),id:z.string().nullable(),fields:z.record(z.string(),z.unknown())}).optional(),
    retryRunId:z.string().optional(),previousRunId:z.string().optional(),mentions:z.array(z.object({type:z.string(),id:z.string(),label:z.string()})).max(30).optional(),
    selection:z.string().max(30000).optional(),
    context:z.object({
      contextBudget:z.number().int().min(0).max(200000),maxTokens:z.number().int().min(0).max(64000),
      includeNovelOutline:z.boolean(),includeVolumeOutline:z.boolean(),includeChapterBlueprint:z.boolean(),
      includeChapterSummaries:z.number().int().min(0).max(100),chapterSummaryMode:z.enum(["summary","tail"]),
      includeArchives:z.boolean(),archiveDepth:z.number().int().min(0).max(100),
      includeCharacters:z.boolean(),characterDetail:z.enum(["brief","standard","full"]),
      includeWorld:z.boolean(),includeForeshadows:z.boolean(),includeStyleGuide:z.boolean(),includeSelection:z.boolean(),
      customInstruction:z.string().max(12000),
    }).partial().optional(),
  }).safeParse(body);
  if(!params.success)throw new ApiError("任务参数无效："+params.error.issues[0].message,400);
  const parsed=params.data;
  return sseResponse(signal=>runAgent({...parsed,agentId:parsed.agentId as AgentRequest["agentId"]},linkedSignal(request,signal)));
});
