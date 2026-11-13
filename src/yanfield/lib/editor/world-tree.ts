/** Keep every card reachable, including orphaned parents and legacy cycles. */
export function worldRows<T extends {id:string;parentId:string|null}>(settings:T[], collapsed:ReadonlySet<string>=new Set()):{setting:T;depth:number}[] {
  const ids=new Set(settings.map(s=>s.id));
  const children=new Map<string,T[]>();
  for(const setting of settings)if(setting.parentId){const list=children.get(setting.parentId)??[];list.push(setting);children.set(setting.parentId,list);}
  const rows:{setting:T;depth:number}[]=[];
  const seen=new Set<string>();
  const walk=(setting:T,depth:number,visible:boolean)=>{
    if(seen.has(setting.id))return;
    seen.add(setting.id);
    if(visible)rows.push({setting,depth});
    for(const child of children.get(setting.id)??[])walk(child,depth+1,visible&&!collapsed.has(setting.id));
  };
  for(const setting of settings)if(!setting.parentId||!ids.has(setting.parentId))walk(setting,0,true);
  for(const setting of settings)if(!seen.has(setting.id))walk(setting,0,true);
  return rows;
}
