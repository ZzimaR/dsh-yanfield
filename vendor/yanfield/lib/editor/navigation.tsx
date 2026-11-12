"use client";

import * as React from "react";

type SaveEditor = () => Promise<void>;

export function isSaveShortcut(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing" | "defaultPrevented">,
): boolean {
  return !event.defaultPrevented && !event.isComposing && event.key !== "Process"
    && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
    && (event.code === "KeyS" || event.key.toLowerCase() === "s");
}

export interface EditorSaveGuard {
  register: (save: SaveEditor) => () => void;
  flush: () => Promise<void>;
  runExclusive: <T>(chapterId: string, operation: () => Promise<T>) => Promise<T>;
}

export function createEditorSaveGuard(): EditorSaveGuard {
  let current: SaveEditor | null = null;
  const writes = new Map<string, Promise<void>>();
  return {
    register(save) {
      current = save;
      return () => {
        if (current === save) current = null;
      };
    },
    async flush() {
      if (current) await current();
    },
    async runExclusive(chapterId, operation) {
      const previous = writes.get(chapterId);
      let release!: () => void;
      const turn = new Promise<void>((resolve) => {
        release = resolve;
      });
      writes.set(chapterId, turn);
      try {
        if (previous) await previous;
        return await operation();
      } finally {
        release();
        if (writes.get(chapterId) === turn) writes.delete(chapterId);
      }
    },
  };
}

export async function navigateAfterSaving(save: SaveEditor, navigate: () => void): Promise<void> {
  await save();
  navigate();
}

const EditorSaveGuardContext = React.createContext<EditorSaveGuard | null>(null);

export function EditorSaveGuardProvider({ children }: { children: React.ReactNode }) {
  const [guard] = React.useState(createEditorSaveGuard);
  return <EditorSaveGuardContext.Provider value={guard}>{children}</EditorSaveGuardContext.Provider>;
}

export function useEditorSaveGuard(): EditorSaveGuard {
  const guard = React.useContext(EditorSaveGuardContext);
  if (!guard) throw new Error("EditorSaveGuardProvider 未挂载");
  return guard;
}
