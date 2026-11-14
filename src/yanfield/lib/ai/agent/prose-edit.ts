import { stripHtml } from "@/lib/ui/cn";
import type { SelectionReference } from "@/lib/editor/selection-reference";

export function escapeProse(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function writerPlainText(output: string): string {
  const text = output.trim().replace(/^```(?:html|text)?\s*\n([\s\S]*?)\n```$/i, "$1").trim();
  return /^<p(?:\s[^>]*)?>[\s\S]*<\/p>$/i.test(text) ? stripHtml(text) : text;
}

/** Resolve a selection against the saved manuscript before asking the model to edit it. */
export function prepareProseEdit(html: string, original: string, range?: SelectionReference) {
  const offsets: { from: number; to: number }[] = [];
  let text = "";
  let seenBlock = false;
  const add = (value: string, from: number, to: number) => {
    text += value;
    for (let i = 0; i < value.length; i++) offsets.push({ from, to });
  };
  for (const token of html.matchAll(/<[^>]*>|&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);|[^<&]+|[<&]/gi)) {
    const [value] = token;
    const from = token.index;
    if (/^<(p|h[1-6]|pre)(?:\s|>)/i.test(value)) {
      if (seenBlock) add("\n", from, from);
      seenBlock = true;
    } else if (/^<br\b/i.test(value)) {
      add("\n", from, from + value.length);
    } else if (!/^<[^>]*>$/.test(value)) {
      const decoded = value.startsWith("&") ? stripHtml(value) || (value === "&nbsp;" || value === "&#160;" ? " " : value) : value;
      if (decoded !== value) add(decoded, from, from + value.length);
      else for (let i = 0; i < value.length; i++) add(value[i], from + i, from + i + 1);
    }
  }
  const start = range?.from ?? text.indexOf(original);
  if (start < 0 || text.slice(start, range?.to ?? start + original.length) !== original ||
      (!range && text.indexOf(original, start + 1) !== -1)) {
    throw new Error("选区已变化或无法定位，请重新选择正文");
  }
  let position = start;
  const fragments = original.split("\n").flatMap((line, index) => {
    const spans = offsets.slice(position, position + line.length);
    position += line.length + 1;
    return line.trim() ? [{ id: index + 1, text: line, spans }] : [];
  });
  return {
    fragments: fragments.map(({ id, text }) => ({ id, text })),
    patches: (replacement: ReadonlyMap<number, string>) => fragments.flatMap(({id,text:line,spans}) => {
      const value = replacement.get(id);
      if (value === undefined) return [];
      const revised = value.trim()
        ? line.slice(0, line.length - line.trimStart().length) + value.trim() + line.slice(line.trimEnd().length)
        : "";
      if (line === revised) return [];
      // Preserve formatting for common prefix and suffix by editing just the changed middle.
      let prefix = 0;
      while (prefix < line.length && line[prefix] === revised[prefix]) prefix++;
      let suffix = 0;
      while (suffix < line.length - prefix && suffix < revised.length - prefix &&
        line[line.length - 1 - suffix] === revised[revised.length - 1 - suffix]) suffix++;
      const middle = spans.slice(prefix, line.length - suffix);
      const inserted = escapeProse(revised.slice(prefix, revised.length - suffix));
      if (!middle.length) {
        const at = spans[prefix]?.from ?? spans.at(-1)!.to;
        return [{ from: at, to: at, value: inserted }];
      }
      return middle.map((span,i) => ({ ...span, value: i === 0 ? inserted : "" }));
    }),
  };
}

export function applyProsePatches(html: string, patches: { from: number; to: number; value: string }[]): string {
  let end = html.length;
  for (const patch of patches.sort((a,b) => b.from - a.from)) {
    if (patch.to > end || (patch.from === end && patch.from === patch.to)) {
      throw new Error("局部修改范围重叠，请合并后重试");
    }
    html = html.slice(0, patch.from) + patch.value + html.slice(patch.to);
    end = patch.from;
  }
  return html;
}

/** Apply unique excerpts without changing unrelated manuscript markup. */
export function editProse(html: string, edits: { original: string; replacement: string }[]): string {
  const patches = edits.flatMap(edit => {
    if (/[\r\n\u2028\u2029]/.test(edit.original) || /[\r\n\u2028\u2029]/.test(edit.replacement)) {
      throw new Error("修订未能保留原来的段落结构，请重试或缩小选区");
    }
    return prepareProseEdit(html, edit.original).patches(new Map([[1, edit.replacement]]));
  });
  return applyProsePatches(html, patches);
}
