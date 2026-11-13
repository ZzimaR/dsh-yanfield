import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { EditorView } from "@tiptap/pm/view"
import type { FindMatch } from "./find"

export const findHighlightKey = new PluginKey<DecorationSet>("yanfieldFind")

export function revealProsePosition(view: EditorView, position: number) {
  const scrollArea = view.dom.closest("[data-prose-scroll]")
  if (!scrollArea) return
  const visible = scrollArea.getBoundingClientRect()
  const caret = view.coordsAtPos(position)
  const toolbarHeight = scrollArea.querySelector(".sticky")?.getBoundingClientRect().height ?? 0
  if (caret.top < visible.top + toolbarHeight || caret.bottom > visible.bottom) {
    scrollArea.scrollTop += caret.top - visible.top - visible.height / 2
  }
}

export const FindHighlight = Extension.create({
  name: "yanfieldFind",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, previous) {
            const update = transaction.getMeta(findHighlightKey) as { matches: FindMatch[]; activeIndex: number } | undefined
            if (!update) return previous.map(transaction.mapping, transaction.doc)
            return DecorationSet.create(transaction.doc, update.matches.map((match, index) =>
              Decoration.inline(match.from, match.to, {
                class: index === update.activeIndex ? "yf-find-match yf-find-active" : "yf-find-match",
              }),
            ))
          },
        },
        props: {
          decorations: state => findHighlightKey.getState(state),
        },
      }),
    ]
  },
})
