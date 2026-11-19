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
- In windowed mode on macOS, drag the empty area at the top of the bookshelf or in the writing desk header to move the Harness window.
- Menus, dialogs, and narrow-window drawers use brief opening and closing transitions. Turn off interface motion in the editor settings or reduce motion in your system settings.
- Returning to a chapter in the workbench restores its caret and scroll position. Switching chapters starts a fresh undo history.

## 4. Notes

- **Outline**: book outline, volume outlines, chapter blueprints (goal, conflict, emotional arc, scene beats, plot points, hooks, target words, suspense level, and twist level).
- The blueprint list shows the saved suspense level, twist level, and summary. AI proposals are marked **Pending review**. Applying or undoing a proposal updates the list and the count of filled blueprints.
- **Characters**: name, aliases, role, age, personality, goals, relationships, appearance, secrets, appearance chapter, AI visibility.
- **Place cards**: name, aliases, type, parent place, sensory details, and layout. Browse by hierarchy and set AI visibility and reveal chapters.
- **World settings**: name, category, importance, description, related characters, reveal chapter, AI visibility.
- **Foreshadowing**: content, planted chapter, payoff chapter, status, importance.
- **Story archive**: chapter summary, character states, setting changes, ledger, timeline, unresolved conflicts; marked stale after prose edits, manual corrections are kept on re-extraction.
- **Visibility rules**: notes stay hidden from the AI before their reveal chapter; turning off "AI visibility" hides them even from explicit `@` references.

## 5. Import and export

- **Import TXT**: detects headings such as "Chapter 12", "Chapter Twelve", "Chapter IV", "Volume Two: The Sea", "Prologue" and "Epilogue" (Chinese 第X章 / 卷 and `1、` numbering also work), previews the chapters, then writes them; about 2000 chapters per import.
- **Export**: whole novel or a single chapter as Markdown / TXT.
- **Export backup**: in Settings → Data, export one, several, or all books. Book backups include outlines, story notes and their order, archives, conversations, and pending changes. A full backup also includes global settings, presets, model service configuration, and writing statistics. Set a password to transfer API keys stored in Yanfield.
- **Import backup**: preview the file and select books to import as copies. A full backup can also replace your current library and settings. Yanfield saves a database snapshot in the data folder before replacing them.

## 6. AI assistant

Panel layout:

- Top: conversation title (auto-named from the first prompt), history, new conversation.
- When you ask for an opinion about the book, the assistant can read relevant material and give a direct answer. Expand the activity or references to see what it read.
- Progress messages stay visible as the assistant displays each piece of the answer it receives. Proposals for review appear after the answer is complete.
- Each assistant message has one **Reasoning** section. During generation, the collapsed section shows only the status. Expand it to read the latest three lines, or view the full reasoning after the reply ends.
- Applying a change in the manuscript review updates its status in chat. Open **Activity log** to see individual tool results and the materials read.
- In manuscript review, use **Previous change** and **Next change** to navigate across chapters changed in the same turn. You can preview a grouped proposal one change at a time and apply it as a whole.
- The active conversation stays open when switching chapters within a book. New messages use the current chapter as context, and tasks in progress keep the chapter specified when they were sent.
- The assistant uses your latest request to choose whether to search, read, prepare note or prose edits, or prepare a deletion. Manuscript passages can serve as sources for new cards. Ask for multiple types of changes together when you need them. Use **Keep editing** on the proposal you want to revise.
- The continuation, expansion, polishing, and AI-tone cleanup shortcuts in the manuscript toolbar use their corresponding enabled presets during prose generation. Presets guide the writing, and the current request determines what can change.
- The assistant submits batches of note additions or edits together. Each item is validated independently. The activity log shows any failed items, and successful proposals stay available for review below the reply.
- Retrying a task from conversation history uses its original chapter. Tasks created with this version also retain the selection, references, and context settings.
- When you click the AI input, the quoted passage stays softly highlighted in the manuscript. Place the cursor back in the manuscript to clear the selection, or select a new passage to update the reference.
- Messages sent with selected prose show the chapter and line range. Expand the reference to see the original text sent with the message. Line numbers follow paragraphs and manual line breaks.
- Short writing requests can use the current context. For example, `这里顺一点` polishes the selected passage, `接着写` continues the current chapter, and `根据正文改章纲` reads the full chapter before proposing an updated blueprint.
- Middle: message stream. Task steps keep their order and the current step updates in place. Scroll up to read earlier messages while the assistant is working. Return to the bottom or click **New updates · Back to bottom** to resume following.
- Ask the assistant to split at a paragraph, move a chapter, or rename it. A split shortens the original chapter and inserts the second half as one change that you can review, apply, or undo. It can reuse a chapter that already contains the entire second half. Chapter deletion requires an explicit request and confirmation. Resolve any linked blueprint, archive, foreshadowing, or conversation before deleting. A move can also include a new title when requested.
- Choose a chapter operation from **Skills** in the message composer. Keep the inserted prefix and fill in the details. The assistant can search and read material and can only prepare the selected type of change for that request.
- **Merge chapters** joins two consecutive chapters in one volume, keeping the earlier chapter and removing the later one after any links to it are resolved. **Move paragraphs between chapters** selects a continuous range using quoted paragraph openings or a count from either end. Insert it at the beginning or end of another chapter, or next to a quoted paragraph. Both tools let you review, apply, and undo the changes together.
- **Organize chapters** groups moves, renames, summaries, inline edits, opening or closing transitions, and repairs to partial splits within one volume. Pending prose edits from the same turn can join the proposal when no notes depend on them. Name the chapter that already contains the duplicated ending so the assistant can verify and trim it from the source. Expand the proposal to compare the chapter order and review text changes.
- Bottom: skills (quick prompts), persona / style / archive pickers, input box, model and reasoning level, `@` references, send.
- Status line: today's usage, estimated cost, balance.

Capabilities:

- Continue, expand, polish, remove AI flavour, diagnose a chapter, draft blueprints, create character / world cards, extract story archives.
- Edit prose (paragraph-by-paragraph review), edit notes (field-level comparison), create notes, tidy blueprints, record foreshadowing.
- `@` reference chapters, characters, places, settings, foreshadowing, archives; context budget (unlimited by default; 96k / 128k / 256k / 512k presets) with per-section preview.
- Writing shortcuts and editor panels come with default prompts that you can customize in settings.
- Persona: name, role, description, greeting, extra requirements, restorable.

Review flow:

1. Prose proposals show a word delta such as `319 → 338 words (+19)`. Note proposals start as clickable names. Open one to see field differences and source passages, or to apply or discard that item. Linked fields such as **Parent place** show the linked item's name. Use the checkboxes next to the names to select notes to apply together. Open **Activity log** to see tools and materials read.
2. The prose area opens the review at the first change. Deletions appear crossed out in red, and insertions are highlighted in green. Use **Go to change** for a single change, or **Previous change** and **Next change** to move between changes.
3. **Keep all** saves the entire revision immediately. **Revert all** discards it.
4. To review paragraph by paragraph, select **Keep** or **Revert**, then click **Confirm review**. Undecided paragraphs keep their original text. After closing a pending review, you can reopen it from the proposal card in the conversation.
5. After applying you can **Undo this round** or open the **change history**.

When prose is selected, a revision replaces only the selected text in the current chapter. You can also quote a unique passage to request a local edit and keep the surrounding text and formatting. Automatically suggested note changes start unchecked, with a quotation for each suggested field. If the quotation is already in the saved chapter, you can apply the note on its own. If the quotation appears only in the draft, keep the cited passage first or apply the prose and note together. You can request separate edits to personality, speech style, and long-term goals.

## 7. Settings

- **Model services** syncs the DSH model catalog, groups default-model options by route, and lets you check your DeepSeek balance. LM Studio, vLLM, and llama.cpp connect through a [custom DSH model route](ai-and-cost.md).
- **Prompt presets**: opens to custom presets. View or duplicate built-in templates and manage your own prompts for specific shortcuts and editor panels.
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
