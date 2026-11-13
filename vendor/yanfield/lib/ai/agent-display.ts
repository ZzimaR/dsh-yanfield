import type { AgentDef } from "@/lib/types";
import { getYanfieldLocale } from "@/lib/i18n/core";

/** Display name for built-in agents: English UI uses the English persona name. */
export function localizedAgentName(agent: Pick<AgentDef, "name" | "englishName">): string {
  return getYanfieldLocale() === "en" && agent.englishName ? agent.englishName : agent.name;
}
