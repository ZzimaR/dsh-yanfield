import type {ProviderConfig} from "@/lib/types";
export const DEEPSEEK_PRICE_URL="https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";
export interface OfficialPricing {providerId:string;model:string;source:string;fetchedAt:string;rates:{period:string;inputPerMillion:number;outputPerMillion:number;cachedInputPerMillion:number}[];}
function text(html:string):string{return html.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi,"").replace(/<[^>]+>/g,"").replace(/&nbsp;|&#160;/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).trim();}
/** Expand merged table cells so model columns and rate labels cannot shift silently. */
export function parseDeepseekPricing(html:string,model:string):OfficialPricing["rates"] {
  const canonical=["deepseek-v4-flash","deepseek-v4-flash-vision-exp"].includes(model)?"deepseek-flash":model;
  const table=html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if(!table)throw new Error("官方价格页面未找到价格表，未修改已有单价");
  const grid:string[][]=[];
  for(const [r,row] of [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].entries()){
    grid[r]??=[];let column=0;
    for(const cell of row[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)){
      while(grid[r][column]!==undefined)column++;
      const span=(name:string)=>Number(cell[1].match(new RegExp(name+'=["\']?(\\d+)','i'))?.[1]??1);
      const rows=span("rowspan"),columns=span("colspan");
      if(rows>30||columns>30)throw new Error("官方价格表结构异常");
      for(let y=0;y<rows;y++){grid[r+y]??=[];for(let x=0;x<columns;x++)grid[r+y][column+x]=text(cell[2]);}column+=columns;
    }
  }
  const column=grid.find(row=>row.includes(canonical))?.indexOf(canonical)??-1;
  if(column<0)throw new Error("官方价格表未列出此模型，未猜测单价");
  const price=(label:RegExp,period:string)=>{
    const row=grid.find(row=>label.test(row.slice(0,column).join(" "))&&row.slice(0,column).includes(period));
    const raw=row?.[column];
    if(!raw||!/^\d+(?:\.\d+)?元$/.test(raw))throw new Error("官方价格表格式已变化，无法可靠解析人民币单价，请查看官方页面");
    return Number(raw.replace("元",""));
  };
  return ["空闲时段","高峰时段"].map(period=>({period,inputPerMillion:price(/输入.*缓存未命中/,period),cachedInputPerMillion:price(/输入.*（缓存命中）/,period),outputPerMillion:price(/百万tokens输出/,period)}));
}
export async function fetchOfficialPricing(provider:ProviderConfig,model:string):Promise<OfficialPricing>{
  let host="";try{host=new URL(provider.baseUrl||"https://api.deepseek.com").hostname;}catch{}
  if(host!=="api.deepseek.com")throw new Error("当前仅支持 DeepSeek 官方服务自动获取人民币单价；中转服务请使用其自己的报价，已有单价保持不变");
  if(!["deepseek-flash","deepseek-v4-pro","deepseek-v4-flash","deepseek-v4-flash-vision-exp"].includes(model))throw new Error("此模型尚无可验证的官方价格映射，请手动填写");
  const response=await fetch(DEEPSEEK_PRICE_URL,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`官方价格页面暂不可用（HTTP ${response.status}），已有单价保持不变`);
  const html=await response.text();if(html.length>2000000)throw new Error("官方价格页面异常，未修改单价");
  return {providerId:provider.id,model,source:DEEPSEEK_PRICE_URL,fetchedAt:new Date().toISOString(),rates:parseDeepseekPricing(html,model)};
}
