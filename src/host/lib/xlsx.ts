/**
 * XLSX export for sheet artifacts. The output is a minimal but valid OOXML
 * workbook: one worksheet per sheet, inline strings, cell styles, column
 * widths, formulas, and cached formula results. fflate (MIT) writes the ZIP.
 *
 * A formula keeps a cached result so a preview tool shows the same value as
 * the panel, while calcPr asks Excel and LibreOffice to recalculate on load.
 */

import { zipSync, strToU8 } from 'fflate';
import { columnName, evaluateWorkbook, formatNumber, usedBounds } from '../../sheet/index.js';
import type { CellResult, EvaluatedWorkbook, SheetCell, SheetStyle, SheetWorkbook } from '../../sheet/index.js';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIPS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const BUILTIN_NUMBER_FORMATS: Readonly<Record<string, number>> = {
  integer: 1,
  number: 2,
  percent: 10,
  date: 14,
  currency: 164,
};

const CUSTOM_NUMBER_FORMATS = '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>';

function xmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xmlAttribute(value: string): string {
  return xmlText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function colorHex(value: string): string {
  const hex = value.replace('#', '').toUpperCase();
  return 'FF' + (hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex);
}

interface FontSpec {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
}

interface StyleSpec {
  font: FontSpec;
  fill: string | null;
  align: 'left' | 'center' | 'right' | null;
  numberFormat: string | null;
}

interface StyleTables {
  fonts: FontSpec[];
  fills: string[];
  styles: StyleSpec[];
}

function normaliseStyle(style: SheetStyle | undefined): StyleSpec | undefined {
  if (style === undefined) return undefined;
  const font: FontSpec = {
    bold: style.bold === true,
    italic: style.italic === true,
    underline: style.underline === true,
    strike: style.strike === true,
    color: style.color ?? null,
  };
  const spec: StyleSpec = {
    font,
    fill: style.background ?? null,
    align: style.align ?? null,
    numberFormat: style.numberFormat === undefined || style.numberFormat === 'general' ? null : style.numberFormat,
  };
  const plain = !font.bold && !font.italic && !font.underline && !font.strike && font.color === null
    && spec.fill === null && spec.align === null && spec.numberFormat === null;
  return plain ? undefined : spec;
}

function fontKey(font: FontSpec): string {
  return (font.bold ? 'b' : '') + (font.italic ? 'i' : '') + (font.underline ? 'u' : '') + (font.strike ? 's' : '') + (font.color === null ? '' : font.color);
}

function styleKey(style: StyleSpec): string {
  return fontKey(style.font) + '|' + (style.fill ?? '') + '|' + (style.align ?? '') + '|' + (style.numberFormat ?? '');
}

/**
 * Build the shared font, fill, and xf tables for one workbook.
 * @param workbook the workbook.
 * @returns the tables.
 */
function styleTables(workbook: SheetWorkbook): StyleTables {
  const fonts: FontSpec[] = [{ bold: false, italic: false, underline: false, strike: false, color: null }];
  const fills: string[] = [];
  const styles: StyleSpec[] = [];
  const fontSeen = new Set<string>(['']);
  const fillSeen = new Set<string>();
  const styleSeen = new Set<string>();
  for (const sheet of workbook.sheets) {
    for (const cell of Object.values(sheet.cells)) {
      const spec = normaliseStyle(cell.style);
      if (spec === undefined) continue;
      if (!fontSeen.has(fontKey(spec.font))) {
        fontSeen.add(fontKey(spec.font));
        fonts.push(spec.font);
      }
      if (spec.fill !== null && !fillSeen.has(spec.fill)) {
        fillSeen.add(spec.fill);
        fills.push(spec.fill);
      }
      if (!styleSeen.has(styleKey(spec))) {
        styleSeen.add(styleKey(spec));
        styles.push(spec);
      }
    }
  }
  return { fonts, fills, styles };
}

function fontIdOf(tables: StyleTables, spec: StyleSpec): number {
  const index = tables.fonts.findIndex((font) => fontKey(font) === fontKey(spec.font));
  return index < 0 ? 0 : index;
}

function fillIdOf(tables: StyleTables, spec: StyleSpec): number {
  if (spec.fill === null) return 0;
  const index = tables.fills.indexOf(spec.fill);
  return index < 0 ? 0 : index + 2;
}

function xfIdOf(tables: StyleTables, spec: StyleSpec | undefined): number {
  if (spec === undefined) return 0;
  const index = tables.styles.findIndex((style) => styleKey(style) === styleKey(spec));
  return index < 0 ? 0 : index + 1;
}

function fontXml(font: FontSpec): string {
  const parts = ['<font>'];
  if (font.bold) parts.push('<b/>');
  if (font.italic) parts.push('<i/>');
  if (font.strike) parts.push('<strike/>');
  if (font.underline) parts.push('<u/>');
  parts.push('<sz val="11"/>');
  if (font.color !== null) parts.push('<color rgb="' + colorHex(font.color) + '"/>');
  parts.push('<name val="Calibri"/><family val="2"/>');
  parts.push('</font>');
  return parts.join('');
}

function fillXml(color: string): string {
  return '<fill><patternFill patternType="solid"><fgColor rgb="' + colorHex(color) + '"/><bgColor indexed="64"/></patternFill></fill>';
}

function stylesXml(tables: StyleTables): string {
  const fonts = tables.fonts.map(fontXml).join('');
  const fills = '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' + tables.fills.map(fillXml).join('');
  const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  for (const style of tables.styles) {
    const numFmtId = style.numberFormat === null ? 0 : BUILTIN_NUMBER_FORMATS[style.numberFormat] ?? 0;
    const attributes = [
      'numFmtId="' + String(numFmtId) + '"',
      'fontId="' + String(fontIdOf(tables, style)) + '"',
      'fillId="' + String(fillIdOf(tables, style)) + '"',
      'borderId="0"',
      'xfId="0"',
    ];
    if (numFmtId !== 0) attributes.push('applyNumberFormat="1"');
    if (fontIdOf(tables, style) !== 0) attributes.push('applyFont="1"');
    if (fillIdOf(tables, style) !== 0) attributes.push('applyFill="1"');
    if (style.align !== null) attributes.push('applyAlignment="1"');
    const alignment = style.align === null ? '' : '<alignment horizontal="' + style.align + '"/>';
    xfs.push('<xf ' + attributes.join(' ') + '>' + alignment + '</xf>');
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="' + MAIN + '">' + CUSTOM_NUMBER_FORMATS +
    '<fonts count="' + String(tables.fonts.length) + '">' + fonts + '</fonts>' +
    '<fills count="' + String(tables.fills.length + 2) + '">' + fills + '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + String(xfs.length) + '">' + xfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

function numberXml(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

function cellXml(ref: string, cell: SheetCell, result: CellResult | undefined, styleIndex: number): string {
  const styleAttribute = styleIndex === 0 ? '' : ' s="' + String(styleIndex) + '"';
  if (cell.formula !== undefined) {
    const formula = cell.formula.startsWith('=') ? cell.formula.slice(1) : cell.formula;
    if (result?.error !== undefined) return '<c r="' + ref + '"' + styleAttribute + ' t="e"><f>' + xmlText(formula) + '</f><v>' + xmlText(result.error) + '</v></c>';
    if (result === undefined || result.value === null) return '<c r="' + ref + '"' + styleAttribute + '><f>' + xmlText(formula) + '</f></c>';
    if (typeof result.value === 'number') return '<c r="' + ref + '"' + styleAttribute + '><f>' + xmlText(formula) + '</f><v>' + numberXml(result.value) + '</v></c>';
    if (typeof result.value === 'boolean') return '<c r="' + ref + '"' + styleAttribute + ' t="b"><f>' + xmlText(formula) + '</f><v>' + (result.value ? '1' : '0') + '</v></c>';
    return '<c r="' + ref + '"' + styleAttribute + ' t="str"><f>' + xmlText(formula) + '</f><v>' + xmlText(result.value) + '</v></c>';
  }
  if (cell.value === undefined) return '<c r="' + ref + '"' + styleAttribute + '/>';
  if (typeof cell.value === 'number') return '<c r="' + ref + '"' + styleAttribute + '><v>' + numberXml(cell.value) + '</v></c>';
  if (typeof cell.value === 'boolean') return '<c r="' + ref + '"' + styleAttribute + ' t="b"><v>' + (cell.value ? '1' : '0') + '</v></c>';
  return '<c r="' + ref + '"' + styleAttribute + ' t="inlineStr"><is><t xml:space="preserve">' + xmlText(cell.value) + '</t></is></c>';
}

function columnsXml(widths: Record<string, number> | undefined): string {
  if (widths === undefined) return '';
  const columns = Object.entries(widths).map(([name, width]) => {
    let column = 0;
    for (const letter of name) column = column * 26 + (letter.charCodeAt(0) - 64);
    const excelWidth = Math.round((width / 7) * 100) / 100;
    return '<col min="' + String(column) + '" max="' + String(column) + '" width="' + String(excelWidth) + '" customWidth="1"/>';
  });
  return columns.length === 0 ? '' : '<cols>' + columns.join('') + '</cols>';
}

function worksheetXml(sheetName: string, workbook: SheetWorkbook, evaluated: EvaluatedWorkbook, tables: StyleTables): string {
  const sheet = workbook.sheets.find((item) => item.name === sheetName);
  if (sheet === undefined) return '';
  const bounds = usedBounds(sheet);
  const results = evaluated.results[sheet.name] ?? {};
  const rowsXml: string[] = [];
  for (let row = 1; row <= Math.max(1, bounds.rows); row += 1) {
    const cells: string[] = [];
    for (let column = 0; column < Math.max(1, bounds.columns); column += 1) {
      const ref = columnName(column) + String(row);
      const cell = sheet.cells[ref];
      const result = results[ref];
      if (cell === undefined && result === undefined) continue;
      const styleIndex = xfIdOf(tables, cell === undefined ? undefined : normaliseStyle(cell.style));
      cells.push(cellXml(ref, cell ?? {}, result, styleIndex));
    }
    if (cells.length > 0) rowsXml.push('<row r="' + String(row) + '">' + cells.join('') + '</row>');
  }
  const dimension = bounds.rows === 0 || bounds.columns === 0
    ? 'A1'
    : 'A1:' + columnName(Math.max(0, bounds.columns - 1)) + String(Math.max(1, bounds.rows));
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="' + MAIN + '" xmlns:r="' + RELATIONSHIPS + '">' +
    '<dimension ref="' + dimension + '"/>' +
    '<sheetViews><sheetView workbookViewId="0"/></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    columnsXml(sheet.columnWidths) +
    '<sheetData>' + rowsXml.join('') + '</sheetData>' +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>';
}

function workbookXml(workbook: SheetWorkbook): string {
  const sheets = workbook.sheets
    .map((sheet, index) => '<sheet name="' + xmlAttribute(sheet.name) + '" sheetId="' + String(index + 1) + '" r:id="rId' + String(index + 1) + '"/>')
    .join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="' + MAIN + '" xmlns:r="' + RELATIONSHIPS + '">' +
    '<sheets>' + sheets + '</sheets>' +
    '<calcPr calcId="171027" fullCalcOnLoad="1"/>' +
    '</workbook>';
}

function workbookRels(workbook: SheetWorkbook): string {
  const sheets = workbook.sheets
    .map((_sheet, index) => '<Relationship Id="rId' + String(index + 1) + '" Type="' + RELATIONSHIPS + '/worksheet" Target="worksheets/sheet' + String(index + 1) + '.xml"/>')
    .join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="' + PACKAGE_RELATIONSHIPS + '">' + sheets +
    '<Relationship Id="rId' + String(workbook.sheets.length + 1) + '" Type="' + RELATIONSHIPS + '/styles" Target="styles.xml"/>' +
    '</Relationships>';
}

function contentTypes(workbook: SheetWorkbook): string {
  const sheets = workbook.sheets
    .map((_sheet, index) => '<Override PartName="/xl/worksheets/sheet' + String(index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    .join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets +
    '</Types>';
}

function packageRels(): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="' + PACKAGE_RELATIONSHIPS + '">' +
    '<Relationship Id="rId1" Type="' + RELATIONSHIPS + '/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
}

/**
 * Write a workbook as an XLSX package.
 * @param workbook the validated workbook.
 * @returns the file bytes.
 */
export function workbookToXlsx(workbook: SheetWorkbook): Buffer {
  const evaluated = evaluateWorkbook(workbook);
  const tables = styleTables(workbook);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes(workbook)),
    '_rels/.rels': strToU8(packageRels()),
    'xl/workbook.xml': strToU8(workbookXml(workbook)),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels(workbook)),
    'xl/styles.xml': strToU8(stylesXml(tables)),
  };
  workbook.sheets.forEach((sheet, index) => {
    files['xl/worksheets/sheet' + String(index + 1) + '.xml'] = strToU8(worksheetXml(sheet.name, workbook, evaluated, tables));
  });
  return Buffer.from(zipSync(files, { level: 6 }));
}

/**
 * The display text for one evaluated value, used by CSV and print copies.
 * @param result the evaluated result.
 * @param style the cell style.
 * @returns the text.
 */
export function resultText(result: CellResult | undefined, style: SheetStyle | undefined): string {
  if (result === undefined) return '';
  if (result.error !== undefined) return result.error;
  const value = result.value;
  if (value === null) return '';
  if (typeof value === 'number') return formatNumber(value, style?.numberFormat);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return value;
}
