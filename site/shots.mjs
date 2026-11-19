// Real product screenshots shown in the "desk" gallery, taken from docs/screenshots/.
// Swap a file in docs/screenshots (keep the name) or edit a path here to update the site.
// Every listed file must exist and be a PNG, otherwise the build fails. An entry with only
// `light` uses that image in both site themes.
export const shots = {
  zh: {
    desk: { light: "docs/screenshots/workspace.png", dark: "docs/screenshots/workspace-dark.png" },
    shelf: { light: "docs/screenshots/library.png" },
  },
  en: {
    desk: { light: "docs/screenshots/en-editor.png", dark: "docs/screenshots/en-editor-dark.png" },
    shelf: { light: "docs/screenshots/en-library.png" },
  },
}
