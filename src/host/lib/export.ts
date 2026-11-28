import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ParagraphChild } from 'docx';
import { marked } from 'marked';
import type { MarkedToken, Token, Tokens } from 'marked';
import { FORMATS_BY_TYPE } from '../../contract.js';
import type { DesignTokens, ExportFormat, ExportedFile, Manifest } from '../../contract.js';
import { DOC_CSP, DOC_STYLE, PAGE_CSP, PRINT_CSP, composePage, escapeHtml } from '../../render.js';
import { SheetError, effectiveTextColor, evaluateWorkbook, parseRangeRef, parseSheetWorkbook, sheetOf, sheetTable, sheetToCsv } from '../../sheet/index.js';
import type { CellRange, SheetTable, SheetWorkbook } from '../../sheet/index.js';
import { workbookToXlsx } from './xlsx.js';
import type { DesignRenderer } from './design-render.js';
import { ArtifactError } from './errors.js';
import { buildSvgViewerHtml } from './svg-viewer.js';
import { buildViewerHtml } from './viewer.js';
import { assertWithin, withLock } from './fsutil.js';
import type { ScopeRoot } from './paths.js';

const MEDIA_TYPES: Readonly<Record<ExportFormat, string>> = {
  html: 'text/html',
  md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  svg: 'image/svg+xml',
  'html-svg': 'text/html',
  fig: 'application/octet-stream',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** The file extension of a format whose id is not its extension. */
const EXTENSIONS: Readonly<Partial<Record<ExportFormat, string>>> = { 'html-svg': 'html' };

const MARKED_TYPES: ReadonlySet<string> = new Set([
  'blockquote', 'br', 'checkbox', 'code', 'codespan', 'def', 'del', 'em', 'escape', 'heading', 'hr', 'html',
  'image', 'link', 'list', 'list_item', 'paragraph', 'space', 'strong', 'table', 'tag', 'text',
]);

/**
 * Tell a built-in token from an extension token.
 * @param token a lexer token.
 * @returns whether it is a built-in token.
 */
function isMarked(token: Token): token is MarkedToken {
  return MARKED_TYPES.has(token.type);
}

/**
 * A file name from the title, never from content: letters, digits, and dashes.
 * @param manifest the manifest.
 * @param format the format.
 * @param now the clock value.
 * @param layerName the exported layer, which keeps two layers from sharing a name.
 * @param layerPath the layer's dotted path, which keeps two same-named layers apart.
 * @returns the file name.
 */
function exportFileName(manifest: Manifest, format: ExportFormat, now: Date, layerName?: string, layerPath?: string): string {
  const slug = (value: string): string =>
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  const title = slug(manifest.title) || 'artifact';
  const pathSuffix = layerPath === undefined ? '' : '-' + layerPath.replace(/\./g, '-');
  const layer = layerName === undefined ? '' : '-' + (slug(layerName) || 'layer') + pathSuffix;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  return `${title}${layer}-v${manifest.version}-${stamp}.${EXTENSIONS[format] ?? format}`;
}

/**
 * Printable HTML for a Markdown document, styled from the design tokens.
 * The same rules style the document editor, so the editor matches the export.
 * @param title the document title.
 * @param markdown the source.
 * @param designCss the token rule.
 * @param print whether to build the print copy, whose policy admits the one hook the panel adds.
 * @returns a full HTML document whose policy comes before its content.
 */
export function docToHtml(title: string, markdown: string, designCss: string, print = false): string {
  const body = marked.parse(markdown, { async: false, gfm: true });
  const style = `
${DOC_STYLE}
body { margin: 0; background: var(--artifact-color-surface); }
main { max-width: 70ch; margin: 0 auto; padding: 56px 32px 72px; }
@media print { main { padding: 0; max-width: none; } }`;
  return composePage(
    `<style>${style}</style><main>${body}</main>`,
    designCss,
    print ? PRINT_CSP : DOC_CSP,
    title,
  );
}

marked.use({
  renderer: {
    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },
  },
});

/** Text styling carried down inline tokens. */
interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
}

/**
 * Turn inline tokens into DOCX runs.
 * @param tokens inline tokens.
 * @param style inherited style.
 * @param tokensDesign design tokens for fonts and colors.
 * @returns paragraph children.
 */
function inlineRuns(tokens: readonly Token[] | undefined, style: RunStyle, tokensDesign: DesignTokens): ParagraphChild[] {
  const runs: ParagraphChild[] = [];
  const mono = firstFamily(tokensDesign.typography.monoFamily);
  const text = (value: string, extra: RunStyle = {}): TextRun => {
    const merged = { ...style, ...extra };
    return new TextRun({
      text: decodeEntities(value),
      bold: merged.bold,
      italics: merged.italics,
      strike: merged.strike,
      ...(merged.code ? { font: mono, shading: { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' } } : {}),
    });
  };
  for (const token of tokens ?? []) {
    if (!isMarked(token)) {
      runs.push(text(token.raw));
      continue;
    }
    switch (token.type) {
      case 'strong':
        runs.push(...inlineRuns(token.tokens, { ...style, bold: true }, tokensDesign));
        break;
      case 'em':
        runs.push(...inlineRuns(token.tokens, { ...style, italics: true }, tokensDesign));
        break;
      case 'del':
        runs.push(...inlineRuns(token.tokens, { ...style, strike: true }, tokensDesign));
        break;
      case 'codespan':
        runs.push(text(token.text, { code: true }));
        break;
      case 'link':
        runs.push(
          new ExternalHyperlink({
            link: token.href,
            children: [new TextRun({ text: decodeEntities(token.text), style: 'Hyperlink' })],
          }),
        );
        break;
      case 'br':
        runs.push(new TextRun({ break: 1 }));
        break;
      case 'text':
        if (token.tokens !== undefined && token.tokens.length > 0) runs.push(...inlineRuns(token.tokens, style, tokensDesign));
        else runs.push(text(token.text));
        break;
      case 'image':
        runs.push(text(`[${token.text || 'image'}]`));
        break;
      default:
        runs.push(text(token.raw));
    }
  }
  return runs;
}

/**
 * Decode the few entities marked leaves in inline text.
 * @param value the text.
 * @returns plain text.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * The first family in a CSS font stack, without quotes.
 * @param stack the stack.
 * @returns one font name.
 */
function firstFamily(stack: string): string {
  const first = (stack.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
  return first === '' || first.startsWith('system-ui') || first.startsWith('ui-') ? 'Calibri' : first;
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

/**
 * Turn block tokens into DOCX blocks.
 * @param tokens block tokens.
 * @param design design tokens.
 * @param depth list depth.
 * @returns paragraphs and tables.
 */
function blocks(tokens: readonly Token[], design: DesignTokens, depth = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const mono = firstFamily(design.typography.monoFamily);
  for (const token of tokens) {
    if (!isMarked(token)) continue;
    switch (token.type) {
      case 'heading':
        out.push(
          new Paragraph({
            heading: HEADINGS[Math.min(5, Math.max(0, token.depth - 1))],
            children: inlineRuns(token.tokens, {}, design),
          }),
        );
        break;
      case 'paragraph':
        out.push(new Paragraph({ children: inlineRuns(token.tokens, {}, design) }));
        break;
      case 'code':
        for (const line of token.text.split('\n')) {
          out.push(
            new Paragraph({
              shading: { type: ShadingType.CLEAR, fill: 'F1F5F9', color: 'auto' },
              spacing: { after: 0 },
              children: [new TextRun({ text: line === '' ? ' ' : line, font: mono })],
            }),
          );
        }
        out.push(new Paragraph({ children: [] }));
        break;
      case 'blockquote':
        out.push(...blocks(token.tokens, design, depth));
        break;
      case 'list':
        token.items.forEach((item) => {
          const [first, ...rest] = item.tokens;
          const lead =
            first !== undefined && isMarked(first) && (first.type === 'text' || first.type === 'paragraph')
              ? inlineRuns(first.tokens ?? [], {}, design)
              : [];
          const prefix = item.task ? [new TextRun({ text: item.checked === true ? '☑ ' : '☐ ' })] : [];
          out.push(
            new Paragraph({
              ...(token.ordered
                ? { numbering: { reference: 'artifact-numbers', level: Math.min(depth, 8) } }
                : { bullet: { level: Math.min(depth, 8) } }),
              children: [...prefix, ...lead],
            }),
          );
          out.push(...blocks(first === undefined || lead.length === 0 ? item.tokens : rest, design, depth + 1));
        });
        break;
      case 'table':
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [token.header, ...token.rows].map(
              (cells, rowIndex) =>
                new TableRow({
                  tableHeader: rowIndex === 0,
                  children: cells.map(
                    (cell) =>
                      new TableCell({
                        children: [new Paragraph({ children: inlineRuns(cell.tokens, { bold: rowIndex === 0 }, design) })],
                      }),
                  ),
                }),
            ),
          }),
        );
        break;
      case 'hr':
        out.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8', space: 1 } },
            children: [],
          }),
        );
        break;
      case 'html':
        out.push(new Paragraph({ children: [new TextRun({ text: token.text })] }));
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * A DOCX file for a Markdown document. Text goes through the writer library,
 * which escapes it; no HTML is concatenated.
 * @param title the document title.
 * @param markdown the source.
 * @param design design tokens for fonts and heading color.
 * @returns the file bytes.
 */
async function docToDocx(title: string, markdown: string, design: DesignTokens): Promise<Buffer> {
  const tokens = marked.lexer(markdown, { gfm: true });
  const color = design.colors.primary.startsWith('#') && design.colors.primary.length === 7
    ? design.colors.primary.slice(1)
    : undefined;
  const document = new Document({
    title,
    creator: 'dsh-artifact-studio',
    styles: {
      default: { document: { run: { font: firstFamily(design.typography.fontFamily), size: 22 } } },
      paragraphStyles: [1, 2, 3].map((level) => ({
        id: `Heading${level}`,
        name: `Heading ${level}`,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { bold: true, size: [36, 30, 26][level - 1], ...(color === undefined ? {} : { color }) },
        paragraph: { spacing: { before: 240, after: 120 } },
      })),
    },
    numbering: {
      config: [
        {
          reference: 'artifact-numbers',
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: blocks(tokens, design) }],
  });
  return Packer.toBuffer(document);
}

/** The most cells one printable sheet may cover before the copy refuses. */
const MAX_PRINT_CELLS = 20000;

/**
 * A cell's inline style for a print table. The printed copy uses the artifact
 * tokens for its defaults and the stored cell style for overrides, so it looks
 * like the panel without depending on the panel's CSS.
 * @param cell the table cell.
 * @returns a style attribute value, or an empty string.
 */
function printCellStyle(cell: SheetTable['cells'][number]): string {
  const rules: string[] = [];
  const style = cell.style;
  if (style !== undefined) {
    if (style.bold === true) rules.push('font-weight:600');
    if (style.italic === true) rules.push('font-style:italic');
    const decoration = [style.underline === true ? 'underline' : '', style.strike === true ? 'line-through' : ''].filter((part) => part !== '').join(' ');
    if (decoration !== '') rules.push('text-decoration:' + decoration);
    if (style.align !== undefined) rules.push('text-align:' + style.align);
    const color = effectiveTextColor(style);
    if (color !== undefined) rules.push('color:' + color);
    if (style.background !== undefined) rules.push('background-color:' + style.background);
  }
  if (style?.align === undefined) rules.push('text-align:' + (typeof cell.value === 'number' ? 'right' : 'left'));
  return rules.join(';');
}

/**
 * A print copy of one sheet workbook: one table per sheet under the workbook
 * title. Formula cells print their computed value.
 * @param workbook the workbook.
 * @param designCss the resolved token CSS.
 * @param title the artifact title.
 * @returns a full HTML document for the print frame.
 */
export function sheetToPrintableHtml(workbook: SheetWorkbook, designCss: string, title: string): string {
  const evaluated = evaluateWorkbook(workbook);
  const sections: string[] = [];
  for (const sheet of workbook.sheets) {
    const table = sheetTable(workbook, evaluated, sheet.name);
    if (table.rows * table.columns > MAX_PRINT_CELLS) {
      throw new ArtifactError('artifact/too-large', 'The sheet "' + sheet.name + '" covers ' + String(table.rows) + ' by ' + String(table.columns) + ' cells; a print copy supports up to ' + String(MAX_PRINT_CELLS) + '. Export XLSX instead.', {
        sheet: sheet.name,
        rows: table.rows,
        columns: table.columns,
        limit: MAX_PRINT_CELLS,
      });
    }
    const byPosition = new Map<string, SheetTable['cells'][number]>();
    for (const cell of table.cells) byPosition.set(String(cell.row) + ',' + String(cell.column), cell);
    const merges = (sheet.merges ?? []).map(parseRangeRef).filter((range): range is CellRange => range !== undefined);
    const rows: string[] = [];
    for (let row = 1; row <= table.rows; row += 1) {
      const cells: string[] = [];
      for (let column = 0; column < table.columns; column += 1) {
        const cell = byPosition.get(String(row) + ',' + String(column));
        const merge = merges.find((range) => row >= range.row1 && row <= range.row2 && column >= range.column1 && column <= range.column2);
        const isAnchor = merge === undefined || (row === merge.row1 && column === merge.column1);
        if (!isAnchor) continue;
        const style = cell === undefined ? '' : printCellStyle(cell);
        const span = merge === undefined
          ? ''
          : (merge.column2 > merge.column1 ? ' colspan="' + String(merge.column2 - merge.column1 + 1) + '"' : '')
            + (merge.row2 > merge.row1 ? ' rowspan="' + String(merge.row2 - merge.row1 + 1) + '"' : '');
        cells.push('<td' + span + (style === '' ? '' : ' style="' + escapeHtml(style) + '"') + '>' + escapeHtml(cell?.display ?? '') + '</td>');
      }
      rows.push('<tr>' + cells.join('') + '</tr>');
    }
    sections.push(
      (workbook.sheets.length > 1 ? '<h2>' + escapeHtml(sheet.name) + '</h2>' : '') +
      '<table><tbody>' + rows.join('') + '</tbody></table>',
    );
  }
  const style = `
body { margin: 0; background: var(--artifact-color-surface); color: var(--artifact-color-text); font-family: var(--artifact-font-family); font-size: 12px; line-height: 1.45; }
main { padding: 28px 24px 40px; }
h1 { margin: 0 0 16px; font-family: var(--artifact-font-display); font-size: 22px; line-height: 1.2; }
h2 { margin: 22px 0 8px; font-size: 13px; font-weight: 600; }
table { border-collapse: collapse; margin: 0 0 24px; }
td { padding: 4px 8px; border: .5px solid color-mix(in srgb, var(--artifact-color-text) 22%, transparent); vertical-align: top; white-space: pre-wrap; }
@media print { main { padding: 0; } tr { break-inside: avoid; } }`;
  return composePage('<style>' + style + '</style><main><h1>' + escapeHtml(title) + '</h1>' + sections.join('') + '</main>', designCss, PRINT_CSP, title);
}

/**
 * Write one export into the scope's `exports/` folder.
 * @param root the scope root.
 * @param manifest the artifact manifest.
 * @param content the artifact content.
 * @param format the requested format.
 * @param design the resolved design system.
 * @param now the clock value.
 * @param designs the design renderer, needed for a design's derived formats.
 * @param sheet the sheet a CSV exports; the first sheet when omitted.
 * @param layerPath the dotted design layer to export instead of the whole design.
 * @returns the written file and its bytes, base64 encoded for a browser download.
 */
export async function writeExport(
  root: ScopeRoot,
  manifest: Manifest,
  content: string,
  format: ExportFormat,
  design: { tokens: DesignTokens; css: string },
  now: Date,
  designs?: DesignRenderer,
  sheet?: string,
  layerPath?: string,
): Promise<ExportedFile> {
  if (!FORMATS_BY_TYPE[manifest.type].includes(format)) {
    throw new ArtifactError('artifact/unsupported-format', `A ${manifest.type} cannot be exported as ${format}.`, {
      supported: FORMATS_BY_TYPE[manifest.type],
    });
  }
  if (layerPath !== undefined) {
    if (manifest.type !== 'design') {
      throw new ArtifactError('artifact/bad-request', 'Only a design has layers to export.');
    }
    if (format !== 'png' && format !== 'svg') {
      throw new ArtifactError('artifact/bad-request', 'A layer export supports only png and svg; fig, html, and html-svg carry the whole design.');
    }
  }
  let data: Buffer;
  let mediaType = MEDIA_TYPES[format];
  let layerName: string | undefined;
  if (manifest.type === 'design') {
    if (designs === undefined) {
      throw new ArtifactError('artifact/design-unavailable', 'The design renderer is not available.', {});
    }
    if (format === 'html') {
      const scene = await designs.exportContent(content, 'fig');
      data = await buildViewerHtml({ title: manifest.title, fig: scene.bytes });
      mediaType = 'text/html';
    } else if (format === 'html-svg') {
      const model = await designs.pageModel(content);
      data = await buildSvgViewerHtml({ title: manifest.title, model });
      mediaType = 'text/html';
    } else if (format === 'png' || format === 'svg' || format === 'fig') {
      const rendered = await designs.exportContent(content, format, layerPath);
      data = rendered.bytes;
      mediaType = rendered.mediaType;
      layerName = rendered.name;
    } else {
      throw new ArtifactError('artifact/unsupported-format', `A design cannot be exported as ${format}.`, {
        supported: FORMATS_BY_TYPE.design,
      });
    }
  } else if (manifest.type === 'sheet') {
    let workbook: SheetWorkbook;
    try {
      workbook = parseSheetWorkbook(content);
    } catch {
      throw new ArtifactError('artifact/corrupt', 'The saved sheet content cannot be read.', { id: manifest.id });
    }
    if (format === 'csv') {
      if (sheet !== undefined) {
        try {
          sheetOf(workbook, sheet);
        } catch (error) {
          throw new ArtifactError('artifact/invalid-sheet', error instanceof SheetError ? error.message : 'No sheet is named "' + sheet + '".', { sheet });
        }
      }
      data = Buffer.from(sheetToCsv(workbook, evaluateWorkbook(workbook), sheet), 'utf8');
    } else if (format === 'xlsx') data = workbookToXlsx(workbook);
    else {
      throw new ArtifactError('artifact/unsupported-format', 'A sheet exports as csv or xlsx.', {
        supported: FORMATS_BY_TYPE.sheet,
      });
    }
  } else if (format === 'docx') data = await docToDocx(manifest.title, content, design.tokens);
  else if (format === 'md') data = Buffer.from(content, 'utf8');
  else if (manifest.type === 'page') data = Buffer.from(composePage(content, design.css, PAGE_CSP, manifest.title), 'utf8');
  else data = Buffer.from(docToHtml(manifest.title, content, design.css), 'utf8');
  const dir = path.join(root.root, 'exports');
  const fileName = exportFileName(manifest, format, now, layerName, layerPath);
  const file = path.join(dir, fileName);
  await withLock(dir, async () => {
    await assertWithin(root.root, dir);
    await fs.mkdir(dir, { recursive: true });
    await assertWithin(root.root, file);
    await fs.writeFile(file, data, { flag: 'wx' });
  });
  return { path: file, bytes: data.length, fileName, mediaType, data: data.toString('base64') };
}
