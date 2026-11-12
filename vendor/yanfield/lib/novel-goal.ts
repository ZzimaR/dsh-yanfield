export const MAX_NOVEL_WORD_GOAL = 100_000_000;

export function isValidNovelWordGoal(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_NOVEL_WORD_GOAL;
}
