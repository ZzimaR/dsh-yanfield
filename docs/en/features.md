# Features

Everything the Yanfield plugin can do, by area. The interface follows the Harness language (English or Chinese); this guide uses the English labels.

## 1. Shelf

- Novel cards: cover color (eight presets), status (draft / serializing / finished), genre, volume and chapter counts, word count, last updated.
- New book: title, genre, one-line pitch, cover color, synopsis, optional first volume.
- Search (title / synopsis), filter by genre, sort by recent update or word count.
- "Sample book" creates a demo manuscript for trying the UI.
- Card menu: rename, change status, copy synopsis, delete (with confirmation).

## 2. Novel overview

- Header with title, genre, status and a shortcut into the writing desk.
- Stats: total words, volumes, chapters, today's words, archive coverage.
- "Continue writing" jumps back to the most recently edited chapter.
- Volume progress and recent chapters.
- Writing goal: target words, daily target, completion.
- Story archive summary: latest archive, stale, pending extraction.

## 3. Writing desk

Three columns:

- **Left rail**: outline (volume / chapter tree), chapter blueprints, notes (characters / places / world / foreshadowing), archives. On narrow panels, the left rail opens as a drawer. Floating blueprint, note, and archive windows stay available when switching left-rail tabs, so you can reference them as you write. Drag the title bar to move the window or its lower-right corner to resize it. You can also enlarge, restore, or minimize it. Long text expands in place for reading and editing.
- **Card order**: drag the handle on the right, or focus the handle and press Up or Down. Each book saves the order of cards with the same group and parent. Children move with their parent. Clear the search to reorder cards.
- **Middle**: prose editor (Tiptap). Toolbar has undo/redo, heading levels, bold / italic / underline / strike, quote, lists, divider, a formatting toolbar and an AI menu.
- **Right**: AI assistant panel (section 6).

Writing features:

- Autosave with adjustable delay (default 1.2s) plus manual save; save state shown in the header.
- Word / paragraph / reading-time stats; chapter status (draft, final, …).
- Focus mode (hide side rails), typewriter mode (caret stays vertically centered).
- Typography: serif or sans, size, weight, line height, letter spacing, paragraph spacing, margins, max line width, with a live preview.
- Find and replace in the chapter. Press `Ctrl / ⌘ + F` to open the panel in the lower-right corner of the editor while the formatting toolbar stays in place. Typing highlights matches in place. Use Previous or Next to jump. Press `Ctrl / ⌘ + Z` to undo a replacement and return to the edited passage.
- The formatting toolbar stays at the top while you scroll the manuscript. `Alt + 1` toggles the outline and `Alt + J` focuses the AI composer.
- Returning to a chapter in the workbench restores its caret and scroll position. Switching chapters starts a fresh undo history.

## 4. Notes

- **Outline**: book outline, volume outlines, chapter blueprints (goal, conflict, emotional arc, scene beats, plot points, hooks, target words, suspense level, and twist level).
- **Characters**: name, aliases, role, age, personality, goals, relationships, appearance, secrets, appearance chapter, AI visibility.
- **Place cards**: name, aliases, type, parent place, sensory details, and layout. Browse by hierarchy and set AI visibility and reveal chapters.
- **World settings**: name, category, importance, description, related characters, reveal chapter, AI visibility.
- **Foreshadowing**: content, planted chapter, payoff chapter, status, importance.
- **Story archive**: chapter summary, character states, setting changes, ledger, timeline, unresolved conflicts; marked stale after prose edits, manual corrections are kept on re-extraction.
- **Visibility rules**: notes stay hidden from the AI before their reveal chapter; turning off "AI visibility" hides them even from explicit `@` references.

## 5. Import and export

- **Import TXT**: detects headings such as "Chapter 12", "Chapter Twelve", "Chapter IV", "Volume Two: The Sea", "Prologue" and "Epilogue" (Chinese 第X章 / 卷 and `1、` numbering also work), previews the chapters, then writes them; about 2000 chapters per import.
- **Export**: whole novel or a single chapter as Markdown / TXT.
- **Backup**: open the database folder from Settings → Data, or copy the path.

## 6. AI assistant

Panel layout:

- Top: conversation title (auto-named from the first prompt), history, new conversation.
- When you ask for an opinion about the book, the assistant can read relevant material and give a direct answer. Expand the activity or references to see what it read.
- Progress messages stay visible while the answer appears below them. Proposals for review appear after the answer.
- Applying a change in the manuscript review updates its status in chat. Open **Activity log** to see individual tool results and the materials read.
- The active conversation stays open when switching chapters within a book. New messages use the current chapter as context, and tasks in progress keep the chapter specified when they were sent.
- Retrying a task from conversation history uses its original chapter. Tasks created with this version also retain the selection, references, and context settings.
- Messages sent with selected prose show the chapter and line range. Expand the reference to see the original text sent with the message. Line numbers follow paragraphs and manual line breaks.
- Short writing requests can use the current context. For example, `这里顺一点` polishes the selected passage, `接着写` continues the current chapter, and `根据正文改章纲` reads the full chapter before proposing an updated blueprint.
- Middle: message stream. Task steps keep their order and the current step updates in place; autoscroll pauses while you read back.
- Bottom: skills (quick prompts), persona / style / archive pickers, input box, model and reasoning level, `@` references, send.
- Status line: today's usage, estimated cost, balance.

Capabilities:

- Continue, expand, polish, remove AI flavour, diagnose a chapter, draft blueprints, create character / world cards, extract story archives.
- Edit prose (paragraph-by-paragraph review), edit notes (field-level comparison), create notes, tidy blueprints, record foreshadowing.
- `@` reference chapters, characters, places, settings, foreshadowing, archives; context budget (unlimited by default; 96k / 128k / 256k / 512k presets) with per-section preview.
- Prompt presets: 20 built in; create, edit, disable, restore defaults.
- Persona: name, role, description, greeting, extra requirements, restorable.

Review flow:

1. The AI proposes changes; the task card always lists every candidate — prose changes with a word delta such as `319 → 338 words (+19)`, note changes with field-level before/after diffs. Only the execution log and reads are collapsed; debug details appear only on failure.
2. The prose area also opens a review: original text (deletions in red, struck through) and the revised text (insertions in green) side by side.
3. For each paragraph press **Keep** or **Revert**; **Revert all** / **Keep all** are also available.
4. Press **Confirm review** — only kept paragraphs are written; undecided paragraphs keep the original text.
5. After applying you can **Undo this round** or open the **change history**.

When prose is selected, a revision replaces only the selected text in the current chapter. You can also quote a unique passage to request a local edit and keep the surrounding text and formatting. Automatically suggested note changes start unchecked, with a quotation for each suggested field. If the quotation is already in the saved chapter, you can apply the note on its own. If the quotation appears only in the draft, keep the cited passage first or apply the prose and note together. You can request separate edits to personality, speech style, and long-term goals.

## 7. Settings

- **Model services**: add / edit / enable / delete services, switch model route (DSH account / official API key), query balance, default model, sync model list.
- **Prompt presets**: built-in and custom presets.
- **Persona**: assistant identity and limits.
- **AI & context**: context section toggles, context budget, max output, usage and cost (three unit prices, one-click official prices, daily and total stats), custom instructions.
- **Editor**: font, size, line height, letter spacing, paragraph spacing, margins, max line width, live preview.
- **Appearance**: theme (rice paper / night sail / follow system), autosave, typewriter mode, focus mode, autosave delay, daily word target.
- **Data**: database path, open folder, copy path, export everything, import TXT, danger zone (regenerate sample novel).
- **About**: version, repository, docs, issues, build time, license, stack, credits.

## 8. Shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt + 1` | Collapse / expand outline |
| `Alt + J` | Focus the AI input |
| `Ctrl / ⌘ + K` | Quick jump (chapters / characters / settings / archives / tabs) |
| `Ctrl / ⌘ + F` | Find in chapter |
| `Enter` | Send AI message |
| `Shift + Enter` | Newline in the AI input |
| `Esc` | Close overlay / leave immersive mode |

## 9. Known limits

- Only DeepSeek official API and the DeepSeek service configured in Harness are supported; no third-party gateways.
- The offline demo model only produces template text and cannot really perform multi-step edits.
- One AI task is capped at 12 decision rounds; very large multi-chapter tasks may need several runs.
- Cost figures are estimates and may differ from the actual bill (cache hits, missing usage reports).
