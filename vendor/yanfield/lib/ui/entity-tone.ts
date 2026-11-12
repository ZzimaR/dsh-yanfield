import type {EntityKind} from "@/lib/ai/agent/types";
export function entityTone(kind:EntityKind):string {
  switch(kind){
    case "character":return "border-purple-400/20 bg-purple-400/10 text-purple-700 dark:text-purple-300";
    case "world":return "border-emerald-400/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300";
    case "foreshadow":return "border-amber-400/20 bg-amber-400/10 text-amber-700 dark:text-amber-300";
    case "chapter":return "border-blue-400/20 bg-blue-400/10 text-blue-700 dark:text-blue-300";
    default:return "border-indigo-400/20 bg-indigo-400/10 text-indigo-700 dark:text-indigo-300";
  }
}
