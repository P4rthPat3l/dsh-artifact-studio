/** Static checks for page content. They warn and never block a write. */

import { KITS, declaredKit, getKit } from '../../kit.js';
import { openingTags } from '../../html-tags.js';
import type { Recipe } from './recipes.js';

const REMOTE = '\\s*["\']?\\s*(?:https?:)?\\/\\/';
const ATTRIBUTE_URL = new RegExp('\\b(?:src|href|action|poster|data)\\s*=' + REMOTE, 'i');
const CSS_URL = new RegExp('url\\(' + REMOTE + '|@import\\s+(?:url\\()?' + REMOTE, 'i');
const SCRIPT_NETWORK = /\b(?:fetch|EventSource|WebSocket|XMLHttpRequest|sendBeacon)\s*\(/;
const STORAGE = /\b(?:localStorage|sessionStorage|indexedDB)\b/;
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;
const FONT_LITERAL = /^\s*font-family\s*:(?!\s*(?:var\(|(?:inherit|initial|unset|revert)\b))/i;

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
  const blocks = (tag: string) => [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '\\s*>', 'gi'))].map((match) => match[1] ?? '').join('\n');
  const markup = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<(pre|code|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const tags = [...openingTags(markup)].map((tag) => tag.text).join('\n');
  return { scripts: blocks('script'), styles: blocks('style'), tags };
}

/**
 * Every declaration in style blocks and style attributes, without comments.
 * @param parts the page parts.
 * @returns declaration texts.
 */
function declarations(parts: PageParts): string[] {
  const inline = [...parts.tags.matchAll(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/gi)].map((match) => match[2] ?? match[3] ?? '');
  const css = parts.styles.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*\{[^}]*\}/gi, '');
  // Splitting on braces separates selectors from declarations; a selector never contains a colon followed by a color.
  return [css, ...inline].flatMap((text) => text.split(/[;{}]/));
}

/** The recipe a page follows, when the write named one. */
export interface PageCheckOptions {
  readonly recipe?: Recipe;
}

/**
 * Find page problems the sandbox, the side panel, or the design system will expose.
 * @param content the page HTML.
 * @param options the recipe the artifact follows, when it has one.
 * @returns one message per problem, each starting with its code.
 */
export function checkPage(content: string, options: PageCheckOptions = {}): string[] {
  const warnings: string[] = [];
  const parts = partsOf(content);
  const { scripts, styles, tags } = parts;
  if (ATTRIBUTE_URL.test(tags) || CSS_URL.test(styles) || CSS_URL.test(tags) || SCRIPT_NETWORK.test(scripts)) {
    warnings.push('network: the page loads or calls a network URL. The sandbox blocks every request, so inline the asset or use a data: URI.');
  }
  if (STORAGE.test(scripts) || STORAGE.test(tags)) {
    warnings.push('storage: browser storage throws in the sandbox. Keep state in memory.');
  }
  const widths = styles + '\n' + tags;
  const fixed = [...widths.matchAll(/(?<![-\w])(?:min-)?width\s*:\s*(\d+)px/gi)].some((match) => Number(match[1]) > MAX_FIXED_WIDTH);
  if (fixed) {
    warnings.push('fixed-width: a fixed width over ' + String(MAX_FIXED_WIDTH) + 'px scrolls sideways in the side panel. Use max-width and a fluid layout.');
  }
  if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(tags)) {
    warnings.push('viewport: the source has no viewport meta. The renderer supplies one, but a raw source copy needs it. Add <meta name="viewport" content="width=device-width, initial-scale=1">.');
  }
  const kitVersion = declaredKit(content);
  const kit = getKit(kitVersion);
  if (kitVersion !== undefined && kit === undefined) {
    warnings.push('kit-version: the page asks for artifact kit "' + kitVersion + '", which does not exist, so no kit styles load. Use content="' + Object.keys(KITS).join('" or "') + '".');
  }
  if (!content.includes('--artifact-') && kit === undefined) {
    warnings.push('no-tokens: the page uses no --artifact-* variables, so it ignores the design system.');
  }
  if (kit !== undefined) {
    const used = new Set([...tags.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi)].flatMap((match) => (match[1] ?? '').split(/\s+/)).filter((name) => name.startsWith('ak-')));
    const unknown = [...used].filter((name) => !kit.classes.includes(name)).sort();
    if (unknown.length > 0) {
      warnings.push('kit-class: ' + unknown.join(', ') + ' are not kit ' + String(kitVersion) + ' classes, so they have no style. Use a kit class from the brief, or a page class without the ak- prefix.');
    }
  }
  const values = declarations(parts).filter((item) => !/^\s*--/.test(item) && item.includes(':'));
  const colors = values.filter((item) => {
    const value = item.slice(item.indexOf(':') + 1)
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '')
      .replace(/\b(?:url|var)\([^)]*\)/gi, '');
    return COLOR_LITERAL.test(value);
  });
  if (colors.length > 0) {
    warnings.push('hard-coded-color: ' + String(colors.length) + ' declarations use literal colors, for example "' + (colors[0] ?? '').trim().slice(0, 80) + '". Use --artifact-* variables. A brand or a product replica defines its colors once as custom properties, on body or .ak-demo, and references them with var().');
  }
  const fonts = values.filter((item) => FONT_LITERAL.test(item));
  if (fonts.length > 0) {
    warnings.push('hard-coded-font: ' + String(fonts.length) + ' font-family declarations name a font directly, for example "' + (fonts[0] ?? '').trim().slice(0, 80) + '". Use --artifact-font-family, --artifact-font-display, or --artifact-font-mono, or a custom property for a product replica.');
  }
  const recipe = options.recipe;
  if (recipe !== undefined) {
    if (kitVersion === undefined) {
      warnings.push('no-kit: the page follows the ' + recipe.id + ' recipe but not the artifact kit. Add <meta name="artifact-kit" content="1"> and use the kit components from the brief.');
    }
    const present = new Set([...tags.matchAll(/\bdata-section\s*=\s*["']?([a-z0-9-]+)/gi)].map((match) => (match[1] ?? '').toLowerCase()));
    const missing = recipe.sections.filter((item) => item.required && !present.has(item.key)).map((item) => item.key);
    if (missing.length > 0) {
      warnings.push('recipe-sections: the ' + recipe.id + ' recipe needs ' + missing.map((key) => 'data-section="' + key + '"').join(', ') + '. Add each section, or mark the element that already holds it.');
    }
  }
  return warnings;
}
