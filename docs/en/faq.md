# FAQ

## Install and start-up

**No Yanfield entry in the sidebar.**
Make sure you fully quit and restarted Harness (a refresh is not enough; the plugin ships host-side code). Check `Settings → Plugins` that `dsh-yanfield` is enabled and at the version you installed; `Yanfield → Settings → About → Build` shows when this package was built.

**Version is not compatible.**
The plugin requires Harness `>=0.2.1-rc.5`. Upgrade or roll back Harness, then install again.

**UI opens but the model does not work.**
See "Models and balance" below.

**How do I uninstall?**
`dsh plugin --profile <profile> remove dsh-yanfield`, then restart Harness. Your manuscript is not deleted.

## Models and balance

**"No DeepSeek API key yet" / the official route shows "Not ready".**
The official API key route is selected but no key is configured. Add one under Model services in DSH, or set `DEEPSEEK_API_KEY`, then switch back to the official route. The account route is preferred by default; the key route is only used when you switch to it.

**`deepseek-v4-pro` is missing from the picker.**
Opening `Settings → Model services` triggers a catalog sync. If it is still missing, the DeepSeek adapter in your Harness only advertises one model; add the model ID manually.

**Balance shows a dash or "not signed in".**
Balance comes from the DeepSeek account signed in to Harness. Sign in there first, then press **Balance**.

**Balance differs from the DeepSeek website.**
The official site is authoritative; the plugin reads whatever the account service returns (credit notes and vouchers can differ).

## Cost

**Cost always says unknown.**
Either the request returned no usage (interrupted, failed), or the model is not in the built-in price table and no unit price is configured. Fill the three prices in `Settings → AI & context → Usage and cost`.

**The numbers look huge.**
The footer is **today's cumulative** tokens and cost, not one task. Open it for per-message details; a single task is usually a few cents.

**Estimate differs from the bill.**
Estimates combine local unit prices with reported usage; cache hits, official price changes and missing usage reports all cause differences. The DeepSeek bill wins.

**Q: What is the default context budget? Can a long novel overflow it?**
Unlimited by default — DeepSeek's window is 1,048,576 tokens, enough for the outline, notes and plenty of previous prose. To cap cost, choose 96k / 128k / 256k / 512k under Settings → AI & context. During a task, if context approaches the window, the oldest observations are dropped first; if it still overflows, you get an explicit context-overflow message with the required and available token counts instead of silent truncation.

**Q: Is there automatic compaction near the 1M limit?**
Not semantic/summary-based compaction today. Over budget we keep the most recent chat turns up to a character cap, drop the rest and tell the model "earlier conversation omitted"; task observations are trimmed oldest-first. Hitting the window raises an explicit error instead of losing content quietly. Summary compaction could be added (it costs one extra model call per compaction), but it is off by default.

## Writing and notes

**The AI cannot see a note.**
Notes stay hidden before their reveal chapter, and each card has an "AI visibility" switch; when off, even an explicit `@` reference cannot read it.

**The AI edited the prose but nothing changed.**
Changes are candidates: keep paragraphs, then press **Confirm review**. Undecided paragraphs keep the original text.

**How do I undo an applied change?**
Use **Undo this round** on the task card, or open **Change history** for earlier snapshots.

**Can I delete the sample novel?**
Yes, from the card menu. `Settings → Data` can regenerate sample content (overwrites sample novels with the same titles).

**TXT import split chapters wrongly.**
Import splits on lines like "Chapter 12", "Chapter Twelve", "Chapter IV", "Volume Two: The Sea", "Prologue" / "Epilogue" (and Chinese 第X章 / 卷 headings) and shows a preview first. Normalize the headings, or fix the chapter tree after import.

## Data

**Where is my manuscript?**
`$DSH_HOME/yanfield/yanfield.db` (plus `-wal` and `-shm`). `Settings → Data` shows the real path and opens the folder. `YANFIELD_DB_PATH` or the plugin's `dataDir` config can point elsewhere.

**Backup / moving machines.**
Quit Harness, then copy the whole database directory. On the new machine keep the same path, or point `YANFIELD_DB_PATH` at the copied file.

**Is anything uploaded?**
No. Context is sent only when you send an AI request, to the DeepSeek service you selected; the plugin collects no telemetry.

## UI

**Dialogs are off-center, or the overlay covers the Harness sidebar.**
Fixed in the current version. If it still happens, check that you installed the latest build (Settings → About → Build).

**The theme does not follow Harness.**
The plugin watches Harness' light/dark marker. If Harness sets none, choose rice paper / night sail / follow system manually in `Settings → Appearance`.

**Text feels too small or too faint.**
`Settings → Editor` controls prose size, line height and margins. Light-theme secondary text gained contrast in 0.1.1; if it still feels faint, send a screenshot.
