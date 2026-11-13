import type { FieldSpec } from "./http";

export const LOCATION_FIELDS: FieldSpec = {
  name: "str",
  aliases: "str[]",
  kind: "str",
  importance: "str",
  parentId: "str|null",
  summary: "str",
  sensory: "str",
  layout: "str",
  occupants: "str",
  rules: "str",
  storyRole: "str",
  currentState: "str",
  tags: "str[]",
  aiVisible: "bool",
  revealAtChapter: "num|null",
  pinned: "bool",
};
