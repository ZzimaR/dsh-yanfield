export interface CacheUsage {cachedInputTokens?:number;cacheReportedInputTokens?:number}
export function inputBreakdown(prompt:number,cache:CacheUsage={}) {
  const total=Number.isFinite(prompt)?Math.max(0,prompt):0;
  const valid=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n)&&n>=0;
  const reported=Math.min(total,valid(cache.cacheReportedInputTokens)?cache.cacheReportedInputTokens:valid(cache.cachedInputTokens)?total:0);
  const cached=Math.min(reported,valid(cache.cachedInputTokens)?cache.cachedInputTokens:0);
  return {cached,uncached:reported-cached,unknown:total-reported,reported};
}
/** Missing/invalid cache metadata is unknown, not a zero hit. */
export function openAiCachedTokens(usage:Record<string,unknown>):number|undefined {
  const total=usage.prompt_tokens;
  if(typeof total!=="number"||!Number.isFinite(total)||total<0)return;
  const details=usage.prompt_tokens_details as {cached_tokens?:unknown}|undefined;
  const hit=usage.prompt_cache_hit_tokens??details?.cached_tokens;
  const miss=usage.prompt_cache_miss_tokens;
  if(typeof hit==="number"&&Number.isFinite(hit)&&hit>=0&&hit<=total){
    if(typeof miss==="number"&&(!Number.isFinite(miss)||miss<0||hit+miss!==total))return;
    return hit;
  }
  if(hit===undefined&&typeof miss==="number"&&Number.isFinite(miss)&&miss>=0&&miss<=total)return total-miss;
}
