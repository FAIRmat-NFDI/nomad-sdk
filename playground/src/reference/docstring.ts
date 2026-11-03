/**
 * Minimal renderer model for the SDK's docstrings (Google style with reST inline roles):
 * paragraphs, bullet lists, `::` / ``` code blocks; inline ``code``, `code`, :class:`target`.
 * Plain TypeScript; the React side maps blocks to MUI Typography / List / code boxes.
 */

export type Inline = { text: string } | { code: string } | { ref: string; label: string };

export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; items: Inline[][] }
  | { type: 'code'; code: string };

const INLINE = /:[a-z]+:`([^`]+)`|``([^`]+)``|`([^`]+)`/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      const target = m[1];
      const label = target.startsWith('~') ? target.split('.').pop()! : target;
      out.push({ ref: target, label });
    } else {
      out.push({ code: (m[2] ?? m[3])! });
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const join = (lines: string[]) => lines.map((l) => l.trim()).join(' ');

function dedent(lines: string[]): string {
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return lines
    .map((l) => l.slice(indent))
    .join('\n')
    .replace(/\n+$/, '');
}

export function parseDocstring(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) body.push(lines[i++]!);
      i++;
      blocks.push({ type: 'code', code: dedent(body) });
      continue;
    }
    if (/^\s*[*-] /.test(line)) {
      const items: string[][] = [];
      while (i < lines.length && lines[i]!.trim()) {
        if (/^\s*[*-] /.test(lines[i]!)) items.push([lines[i]!.replace(/^\s*[*-] /, '')]);
        else items[items.length - 1]!.push(lines[i]!);
        i++;
      }
      blocks.push({ type: 'list', items: items.map((it) => parseInline(join(it))) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^\s*[*-] /.test(lines[i]!)) para.push(lines[i++]!);
    let paragraph = join(para);
    const literal = paragraph.endsWith('::');
    if (literal) paragraph = paragraph.replace(/\s*::$/, paragraph.endsWith(' ::') ? '' : ':');
    if (paragraph) blocks.push({ type: 'paragraph', inlines: parseInline(paragraph) });
    if (literal) {
      while (i < lines.length && !lines[i]!.trim()) i++;
      const body: string[] = [];
      while (i < lines.length && (!lines[i]!.trim() || /^\s+/.test(lines[i]!))) body.push(lines[i++]!);
      blocks.push({ type: 'code', code: dedent(body) });
    }
  }
  return blocks;
}

/** First sentence, for list rows (Learn shows a one-line summary per member). */
export function summary(text: string): string {
  const first = text
    .split(/\n\s*\n/)[0]!
    .replace(/\s+/g, ' ')
    .trim();
  const m = first.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1]! : first)
    .replace(/:[a-z]+:`~?([^`]+)`/g, (_, t: string) => t.split('.').pop()!)
    .replace(/``?([^`]+)``?/g, '$1');
}

/** Long signatures one parameter per line (as on Learn); short ones unchanged. */
export function formatSignature(signature: string, width = 72): string {
  const open = signature.indexOf('(');
  const close = signature.lastIndexOf(')');
  if (signature.length <= width || open < 0 || close < open) return signature;
  const params: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < close; i++) {
    const ch = signature[i]!;
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) {
      params.push(signature.slice(start, i).trim());
      start = i + 1;
    }
  }
  params.push(signature.slice(start, close).trim());
  const body = params
    .filter(Boolean)
    .map((p) => `    ${p},`)
    .join('\n');
  return `${signature.slice(0, open + 1)}\n${body}\n)${signature.slice(close + 1)}`;
}
