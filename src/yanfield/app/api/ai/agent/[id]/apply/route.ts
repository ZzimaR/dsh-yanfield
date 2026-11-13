import { ApiError, handle, ok } from "@/lib/api-utils";
import { readBody } from "@/app/api/_lib/http";
import { applyChanges, getRun, undoChanges } from "@/lib/ai/agent/store";
import { z } from "zod";
export const runtime="nodejs";
export const POST=handle<{id:string}>(async(request,{params})=>{
  const body=await readBody(request);
  if(typeof body.novelId!=="string"||getRun(params.id).novelId!==body.novelId)throw new ApiError("任务不属于该作品",404);
  if(body.op==="undo") return ok(undoChanges(params.id));
  const selection=z.array(z.object({id:z.string(),fields:z.array(z.string()).min(1).optional(),blocks:z.array(z.string()).optional()} )).min(1).max(100).safeParse(body.selections);
  if(!selection.success)throw new ApiError("改动选择无效",400);
  return ok(applyChanges(params.id,selection.data));
});
