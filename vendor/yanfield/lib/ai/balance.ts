import type {ProviderConfig} from "@/lib/types";
import {ProviderError} from "./provider";
export interface ProviderBalance {isAvailable:boolean;balances:{currency:"CNY"|"USD";total:string;granted:string;toppedUp:string}[];fetchedAt:string;}
export function supportsBalance(provider:Pick<ProviderConfig,"baseUrl">):boolean {try{return new URL(provider.baseUrl).hostname==="api.deepseek.com";}catch{return false;}}
export async function getProviderBalance(provider:ProviderConfig):Promise<ProviderBalance>{
  if(!supportsBalance(provider))throw new ProviderError("此服务暂未接入官方余额查询",400);
  if(!provider.apiKey?.trim())throw new ProviderError("请先填写 API Key",400);
  const response=await fetch("https://api.deepseek.com/user/balance",{headers:{Authorization:`Bearer ${provider.apiKey.trim()}`},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new ProviderError(response.status===401?"余额查询鉴权失败，请检查 API Key":`余额查询失败（HTTP ${response.status}），请稍后刷新`,response.status);
  const data=await response.json();
  if(typeof data.is_available!=="boolean"||!Array.isArray(data.balance_infos))throw new ProviderError("余额接口返回格式不受支持");
  const balances:ProviderBalance["balances"]=data.balance_infos.map((item:Record<string,unknown>)=>{
    if(!["CNY","USD"].includes(String(item.currency))||![item.total_balance,item.granted_balance,item.topped_up_balance].every(v=>typeof v==="string"&&/^-?\d+(?:\.\d+)?$/.test(v)))throw new ProviderError("余额接口返回金额格式异常");
    return {currency:item.currency as "CNY"|"USD",total:String(item.total_balance),granted:String(item.granted_balance),toppedUp:String(item.topped_up_balance)};
  });
  return {isAvailable:data.is_available,balances,fetchedAt:new Date().toISOString()};
}
