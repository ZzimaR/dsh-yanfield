import {handle,ok,notFound,ApiError} from "@/lib/api-utils";
import * as repo from "@/lib/repo";
import {getProviderBalance} from "@/lib/ai/balance";
import {ProviderError} from "@/lib/ai/provider";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=handle<{id:string}>(async(_request,{params})=>{
  const provider=repo.getProvider(params.id);if(!provider)return notFound("模型服务不存在");
  try{return ok(await getProviderBalance(provider));}
  catch(error){if(error instanceof ProviderError)throw new ApiError(error.message,error.status);throw new ApiError("余额查询超时或网络异常，请稍后刷新",502);}
});
