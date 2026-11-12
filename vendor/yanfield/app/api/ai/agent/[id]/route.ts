import { handle, ok } from "@/lib/api-utils";
import { getRun, saveRun } from "@/lib/ai/agent/store";
import { readBody, requireQueryParam } from "@/app/api/_lib/http";
import { ApiError } from "@/lib/api-utils";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=handle<{id:string}>(async(request,{params})=>{
  const novelId=requireQueryParam(request,"novelId","作品");
  const value=getRun(params.id);
  if(value.novelId!==novelId)throw new ApiError("任务不属于该作品",404);
  return ok(value);
});
export const PATCH=handle<{id:string}>(async(request,{params})=>{
  const body=await readBody(request),value=getRun(params.id);
  if(typeof body.novelId!=="string"||value.novelId!==body.novelId)throw new ApiError("任务不属于该作品",404);
  if(value.status==="running") throw new ApiError("任务仍在运行",409);
  if(body.op!=="reject") throw new ApiError("不支持的操作",400);
  const change=value.changes.find(c=>c.id===body.changeId);
  if(!change||change.state!=="pending") throw new ApiError("待确认改动不存在",409);
  change.state="rejected";saveRun(value);return ok(value);
});
