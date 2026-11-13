/** Automatic card extraction follows an explicit prose-only restriction across revisions. */
export function automaticMaterialPolicy(message:string,previous?:{request:string;materialPolicy?:"auto"|"skip"},selection?:string):"auto"|"skip" {
  if(selection)return "skip";
  const text=message.replace(/\s+/g,"");
  const noun="(?:资料|卡片|卡|角色卡|人物卡|设定卡|建卡|设定|人物档案)";
  const negative=new RegExp(`(?:不要|不用|不必|无需|别|不再|不)(?:再|自动|继续){0,2}(?:新建|新增|增加|补全|补充|补建|创建|生成|整理|提取|改动|修改|动|建|补)?(?:任何|额外|其他|新的|新|的)?${noun}`);
  if(negative.test(text)||/(?:只|仅)(?:要|需要)?(?:写|改|修改|生成|润色|扩写|续写)正文/.test(text)||/only\s+(?:the\s+)?prose|no\s+(?:new\s+)?(?:cards|materials)/i.test(message))return "skip";
  const explicit=new RegExp(`(?:请|再|也|顺便|需要|帮我)?(?:新建|新增|增加|补全|补充|补建|创建|生成|整理|提取|完善).{0,12}${noun}`);
  if(explicit.test(text))return "auto";
  if(previous?.materialPolicy)return previous.materialPolicy;
  if(previous)return automaticMaterialPolicy(previous.request);
  return "auto";
}
