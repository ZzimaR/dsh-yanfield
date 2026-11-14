import { Extension } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

export const InactiveSelection = Extension.create({
  name: "yanfieldInactiveSelection",
  addProseMirrorPlugins() {
    const { editor } = this
    return [
      new Plugin({
        props: {
          decorations({ doc, selection }) {
            if (editor.isFocused || selection.empty) return null
            const { from, to } = selection
            return DecorationSet.create(doc, [
              Decoration.inline(from, to, { class: "yf-inactive-selection" }),
            ])
          },
        },
      }),
    ]
  },
})
