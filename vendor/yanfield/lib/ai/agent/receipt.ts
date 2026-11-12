import type {AgentChange} from "./types";
const normalized=(text:string)=>text.replace(/[\s\p{P}\p{S}]/gu,"");
/** A proposal replaces whole fields. Expose the actual diff to the model, not just an ID. */
export function proposalReceipt(change:AgentChange){
 const fields=Object.keys(change.after);
 const fieldChanges=fields.map(field=>({field,beforePreview:JSON.stringify(change.before?.[field]??null).slice(0,400),afterPreview:JSON.stringify(change.after[field]).slice(0,400)}));
 const possiblyRemoved=fields.flatMap(field=>{
  const before=change.before?.[field],after=change.after[field];
  if(typeof before!=="string"||typeof after!=="string")return [];
  const next=normalized(after);
  return before.split(/[\n。；;]/).map(text=>text.trim()).filter(text=>normalized(text).length>=6&&!next.includes(normalized(text))).slice(0,8).map(text=>({field,text:text.slice(0,250)}));
 });
 return {changeId:change.id,title:change.title,state:change.state,changedFields:fields,fieldChanges,possiblyRemoved,semantics:"这是字段完整替换，不是追加原字段；possiblyRemoved是未逐字保留的原句，须核对是否未经授权丢失事实。改写不必逐字相同，但最终说明必须与实际候选一致。"};
}
