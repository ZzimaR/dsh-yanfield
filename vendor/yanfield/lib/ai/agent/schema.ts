import { z } from "zod";
import type { EntityKind, Fields } from "./types";

const text = z.string().max(100000);
const name = z.string().trim().min(1).max(200);
const list = z.array(z.string().max(5000)).max(100);
const scene = z.object({ id: z.string(), title: text, summary: text, purpose: text, characters: list, location: text, emotion: text });
export const patchSchemas = {
  chapter: z.object({ title: name, content: text, summary: text, notes: text, volumeId: z.string().nullable(), orderIndex: z.number().int().nonnegative() }).partial().strict(),
  blueprint: z.object({ goal: text, pov: text, conflict: text, emotionalArc: text, scenes: z.array(scene).max(30), plotPoints: list, hooks: list, targetWords: z.number().int().min(100).max(20000), notes: text }).partial().strict(),
  character: z.object({ name, aliases: list, role: z.enum(["protagonist", "antagonist", "supporting", "mentor", "ensemble", "other"]), gender: text, age: text, identity: text, appearance: text, personality: text, goals: text, secrets: text, arc: text, speechStyle: text, currentState: text, tags: list }).partial().strict(),
  world: z.object({ title: name, category: z.enum(["power", "geography", "faction", "item", "rule", "history", "custom"]), importance: z.enum(["high", "medium", "low"]), parentId: z.string().nullable(), summary: text, content: text, tags: list }).partial().strict(),
  foreshadow: z.object({ title: name, description: text, notes: text, status: z.enum(["planted", "advanced", "paid", "dropped"]) }).partial().strict(),
  outline: z.object({ premise: text, theme: text, tone: text, mainPlot: text, subplots: list, characterArcs: z.array(z.object({character: text, arc: text})), worldRules: list, ending: text, hooks: list }).partial().strict(),
  "volume-outline": z.object({ summary: text, arcGoal: text, keyEvents: list, foreshadowPlan: list }).partial().strict(),
} satisfies Record<EntityKind, z.ZodType>;

export function validatePatch(kind: EntityKind, value: unknown): Fields {
  const parsed = patchSchemas[kind].parse(value) as Fields;
  if (!Object.keys(parsed).length) throw new Error("没有可修改的字段");
  return parsed;
}

/** AI prose is always plain text. Never accept executable HTML from a model. */
export function proseHtml(value: string): string {
  return value.trim().split(/\n+/).filter(Boolean).map(p => `<p>${p.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>`).join("");
}
export function sameFields(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).sort(([x],[y]) => x.localeCompare(y)).map(([k,val]) => [k,canonical(val)])) : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
