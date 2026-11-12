import { extractJson } from "@/lib/ai/prompts";

export interface CharacterFill {
  identity: string;
  appearance: string;
  personality: string;
  goals: string;
  secrets: string;
  arc: string;
  speechStyle: string;
  currentState: string;
}

export interface ForeshadowFill {
  description: string;
  notes: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const CHARACTER_KEYS = ["identity", "appearance", "personality", "goals", "secrets", "arc", "speechStyle", "currentState"] as const;

export function parseCharacterFill(text: string): CharacterFill | null {
  const record = asRecord(extractJson<unknown>(text));
  if (!record) return null;
  const fill = {
    identity: textOf(record.identity),
    appearance: textOf(record.appearance),
    personality: textOf(record.personality),
    goals: textOf(record.goals),
    secrets: textOf(record.secrets),
    arc: textOf(record.arc),
    speechStyle: textOf(record.speechStyle),
    currentState: textOf(record.currentState),
  };
  if (CHARACTER_KEYS.every((key) => !fill[key])) return null;
  return fill;
}

export function parseForeshadowFill(text: string): ForeshadowFill | null {
  const record = asRecord(extractJson<unknown>(text));
  if (!record) return null;
  const description = textOf(record.description);
  const notes = textOf(record.notes);
  if (!description && !notes) return null;
  return { description, notes };
}
