/// Some models write their own markup into the text next to a tool call:
/// DeepSeek's DSML blocks, Nova's <thinking>. None of it is meant for a
/// person (view 81). A block is removed whether it closes or is cut off.

const BLOCKS: { open: RegExp; close: RegExp }[] = [
  { open: /<｜DSML｜[a-z_]+/i, close: /<\/｜DSML｜function_calls>/i },
  { open: /<thinking>/i, close: /<\/thinking>/i },
  { open: /<reasoning>/i, close: /<\/reasoning>/i },
];

function removeBlock(text: string, open: RegExp, close: RegExp): string {
  let out = text;
  for (;;) {
    const start = out.search(open);
    if (start < 0) return out;
    const rest = out.slice(start);
    const end = rest.search(close);
    if (end < 0) return out.slice(0, start);
    const closeLen = (rest.slice(end).match(close)?.[0] ?? '').length;
    out = out.slice(0, start) + rest.slice(end + closeLen);
  }
}

export function cleanModelText(text: string): string {
  let out = text;
  for (const { open, close } of BLOCKS) out = removeBlock(out, open, close);
  if (out === text) return text;
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}
