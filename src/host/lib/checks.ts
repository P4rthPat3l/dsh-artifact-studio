/** Static checks for page content. They warn and never block a write. */

const REMOTE = '\\s*["\']?\\s*(?:https?:)?\\/\\/';
const ATTRIBUTE_URL = new RegExp('\\b(?:src|href|action|poster|data)\\s*=' + REMOTE, 'i');
const CSS_URL = new RegExp('url\\(' + REMOTE + '|@import\\s+(?:url\\()?' + REMOTE, 'i');
const SCRIPT_NETWORK = /\b(?:fetch|EventSource|WebSocket|XMLHttpRequest|sendBeacon)\s*\(/;
const STORAGE = /\b(?:localStorage|sessionStorage|indexedDB)\b/;

/** The widest fixed width that still fits the full-width view without sideways scrolling. */
const MAX_FIXED_WIDTH = 960;

/** The parts of a page that run or load: code, styles, and tags. Prose and code samples are left out. */
interface PageParts {
  scripts: string;
  styles: string;
  tags: string;
}

/**
 * Split a page into what the browser executes or fetches. A tutorial that
 * shows fetch() in a code sample, or prose that names localStorage, must not
 * read as a page that calls them.
 * @param content the page HTML.
 * @returns script text, style text, and opening tags.
 */
function partsOf(content: string): PageParts {
  const html = content.replace(/<!--[\s\S]*?-->/g, '');
  const blocks = (tag: string) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi'))].map((match) => match[1] ?? '').join('\n');
  const markup = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<(pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const tags = [...markup.matchAll(/<[a-z][^>]*>/gi)].map((match) => match[0]).join('\n');
  return { scripts: blocks('script'), styles: blocks('style'), tags };
}

/**
 * Find page problems the sandbox or the side panel will expose.
 * @param content the page HTML.
 * @returns one message per problem, each starting with its code.
 */
export function checkPage(content: string): string[] {
  const warnings: string[] = [];
  const { scripts, styles, tags } = partsOf(content);
  if (ATTRIBUTE_URL.test(tags) || CSS_URL.test(styles) || CSS_URL.test(tags) || SCRIPT_NETWORK.test(scripts)) {
    warnings.push('network: the page loads or calls a network URL. The sandbox blocks every request, so inline the asset or use a data: URI.');
  }
  if (STORAGE.test(scripts) || STORAGE.test(tags)) {
    warnings.push('storage: browser storage throws in the sandbox. Keep state in memory.');
  }
  const widths = styles + '\n' + tags;
  const fixed = [...widths.matchAll(/(?<![-\w])(?:min-)?width\s*:\s*(\d+)px/gi)].some((match) => Number(match[1]) > MAX_FIXED_WIDTH);
  if (fixed) {
    warnings.push(`fixed-width: a fixed width over ${MAX_FIXED_WIDTH}px scrolls sideways in the side panel. Use max-width and a fluid layout.`);
  }
  if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(tags)) {
    warnings.push('viewport: the page has no viewport meta, so an exported copy renders zoomed out on a phone. Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
  }
  if (!content.includes('--artifact-')) {
    warnings.push('no-tokens: the page uses no --artifact-* variables, so it ignores the design system.');
  }
  return warnings;
}
