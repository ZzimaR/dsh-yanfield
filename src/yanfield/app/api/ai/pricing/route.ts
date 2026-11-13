import {handle,ok,ApiError} from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import {fetchOfficialPricing} from "@/lib/ai/official-pricing";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=handle(async()=>{
  const target=repo.getSettings().models.chat;
  const provider=target.providerId?repo.getProvider(target.providerId):null;
  if(!provider||!target.model)throw new ApiError("请先选择默认模型",400);
  try{return ok(await fetchOfficialPricing(provider,target.model));}
  catch(error){throw new ApiError(error instanceof Error?error.message:"官方单价获取失败，已有单价保持不变",502);}
});
