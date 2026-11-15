/// Reads a server-sent event stream that may arrive cut at any byte: whole
/// frames come out, comments (the keep-alive) are dropped (view 84).
export class SseParser {
  private buffer = '';

  push(chunk: string): { event: string; data: string }[] {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    const out: { event: string; data: string }[] = [];
    let end = this.buffer.indexOf('\n\n');
    while (end !== -1) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const frame = parse(block);
      if (frame) out.push(frame);
      end = this.buffer.indexOf('\n\n');
    }
    return out;
  }
}

function parse(block: string): { event: string; data: string } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length ? { event, data: data.join('\n') } : null;
}
