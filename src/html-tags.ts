/** A bounded opening-tag scan shared by opt-in detection and advisory checks. */
export interface HtmlTag {
  readonly name: string;
  readonly text: string;
}

/**
 * Consume each complete tag once, including quoted attributes. Skip comments
 * and inert/raw-text contents. This is not a sanitizer or an HTML5 parser.
 */
export function* openingTags(content: string): Generator<HtmlTag> {
  const lower = content.toLowerCase();
  const raw = new Set(['script', 'style', 'textarea', 'title', 'template', 'noscript']);
  let cursor = 0;
  while (cursor < content.length) {
    const start = content.indexOf('<', cursor);
    if (start < 0) return;
    if (content.startsWith('<!--', start)) {
      const end = content.indexOf('-->', start + 4);
      if (end < 0) return;
      cursor = end + 3;
      continue;
    }
    let end = start + 1;
    let quote = '';
    for (; end < content.length; end++) {
      const char = content[end];
      if (quote !== '') { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === content.length) return;
    cursor = end + 1;
    const text = content.slice(start, cursor);
    const name = /^<([a-z][a-z0-9:-]*)(?=\s|\/?>)/i.exec(text)?.[1]?.toLowerCase();
    if (name === undefined) continue;
    yield { name, text };
    if (raw.has(name)) {
      const close = lower.indexOf('</' + name, cursor);
      if (close < 0) return;
      const closeEnd = content.indexOf('>', close);
      if (closeEnd < 0) return;
      cursor = closeEnd + 1;
    }
  }
}
