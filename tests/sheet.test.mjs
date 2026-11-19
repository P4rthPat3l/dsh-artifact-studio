import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import {
  checkSheetWorkbook,
  columnName,
  contrastRatio,
  effectiveTextColor,
  readableTextColor,
  evaluateWorkbook,
  formatCellRef,
  formatScalar,
  parseCellRef,
  parseRangeRef,
  parseSheetOperations,
  parseSheetWorkbook,
  selectionQuote,
  serializeSheetWorkbook,
  sheetOverview,
  sheetToCsv,
  applySheetOperations,
} from '../dist/sheet/index.js';
import { workbookToXlsx } from '../dist/host/lib/xlsx.js';

function workbook(sheets) {
  return JSON.stringify({ schemaVersion: 1, sheets });
}

test('SHEET-UNIT-001: shorthand cells normalise, order, and round-trip', () => {
  const parsed = parseSheetWorkbook(JSON.stringify({
    sheets: [{
      name: 'Budget',
      cells: {
        C2: '=B2*1.2',
        B2: 1200,
        A1: 'Item',
        D2: { value: 10, style: { bold: true, align: 'right', numberFormat: 'currency', background: '#FFF2CC' } },
        E2: { value: '=literal' },
        F2: { value: true },
        G2: { style: { italic: true } },
      },
      columnWidths: { B: 140, A: 160 },
    }],
  }));
  assert.deepEqual(Object.keys(parsed.sheets[0].cells), ['A1', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2']);
  const text = serializeSheetWorkbook(parsed);
  const again = parseSheetWorkbook(text);
  assert.equal(serializeSheetWorkbook(again), text);
  assert.deepEqual(again.sheets[0].columnWidths, { A: 160, B: 140 });
  const encoded = JSON.parse(text);
  assert.equal(encoded.sheets[0].cells.A1, 'Item');
  assert.deepEqual(encoded.sheets[0].cells.C2, { formula: '=B2*1.2' });
  assert.deepEqual(encoded.sheets[0].cells.D2.style, { bold: true, align: 'right', background: '#fff2cc', numberFormat: 'currency' });
  assert.deepEqual(encoded.sheets[0].cells.E2, { value: '=literal' });
  assert.deepEqual(encoded.sheets[0].cells.G2, { style: { italic: true } });
});

test('SHEET-UNIT-002: invalid workbooks are refused with a usable message', () => {
  const cases = [
    ['not json', /not valid JSON/],
    [JSON.stringify({ sheets: [] }), /at least one sheet/],
    [JSON.stringify({ sheets: [{ name: 'a', cells: { A1: { value: 1, formula: '=A1' } } }] }), /both value and formula/],
    [JSON.stringify({ sheets: [{ name: 'a', cells: { ZZZ99999: 1 } }] }), /invalid cell reference/],
    [JSON.stringify({ sheets: [{ name: 'a', cells: {} }, { name: 'A', cells: {} }] }), /unique/],
    [JSON.stringify({ sheets: [{ name: 'a', cells: { A1: { value: 1, style: { color: 'red' } } } }] }), /hex color/],
    [JSON.stringify({ sheets: [{ name: 'a', cells: {}, columnWidths: { A: 2 } }] }), /between 24 and 800/],
    [JSON.stringify({ sheets: [{ name: 'a', cells: { A1: { value: 1, extra: true } } }] }), /unknown field/],
    [JSON.stringify({ schemaVersion: 2, sheets: [{ name: 'a', cells: {} }] }), /schemaVersion/],
  ];
  for (const [source, pattern] of cases) {
    assert.throws(() => parseSheetWorkbook(source), pattern);
  }
});

test('SHEET-UNIT-003: references and headers are canonical', () => {
  assert.equal(columnName(0), 'A');
  assert.equal(columnName(25), 'Z');
  assert.equal(columnName(26), 'AA');
  assert.equal(columnName(99), 'CV');
  assert.equal(formatCellRef(4, 2), 'C4');
  assert.deepEqual(parseCellRef('$b$12'), { row: 12, column: 1 });
  assert.deepEqual(parseRangeRef('C4:A2'), { row1: 2, column1: 0, row2: 4, column2: 2 });
  assert.equal(parseCellRef('A0'), undefined);
  assert.equal(parseCellRef('CW1'), undefined);
});

test('SHEET-UNIT-004: formulas compute values, references, and errors', () => {
  const parsed = parseSheetWorkbook(workbook([
    {
      name: 'Budget',
      cells: {
        A1: 1, A2: 2, A3: 3,
        B1: '=SUM(A1:A3)',
        B2: '=AVERAGE(A1:A3)',
        B3: '=IF(A1>0,"yes","no")',
        B4: '=COUNTIF(A1:A3,">1")',
        B5: '=VLOOKUP(2,A1:B3,2,FALSE)',
        B6: '=Other!A1*2',
        B7: '=1/0',
        B8: '=NOSUCH(1)',
        B9: '=B9+1',
        B10: '=SUM(A1:A3,B7)',
        B11: '=IFERROR(B7,7)',
        C1: { value: 46344, style: { numberFormat: 'date' } },
      },
    },
    { name: 'Other', cells: { A1: 21, B1: '=Budget!A1+1' } },
  ]));
  const evaluated = evaluateWorkbook(parsed);
  const cells = evaluated.results.Budget;
  assert.equal(cells.B1?.display, '6');
  assert.equal(cells.B2?.display, '2');
  assert.equal(cells.B3?.display, 'yes');
  assert.equal(cells.B4?.display, '2');
  assert.equal(cells.B5?.display, '2');
  assert.equal(cells.B6?.display, '42');
  assert.equal(cells.B7?.display, '#DIV/0!');
  assert.equal(cells.B8?.display, '#NAME?');
  assert.equal(cells.B9?.display, '#CYCLE!');
  assert.equal(cells.B10?.display, '#DIV/0!');
  assert.equal(cells.B11?.display, '7');
  assert.equal(cells.C1?.display, '2026-11-18');
  assert.equal(evaluated.results.Other.B1?.display, '2');
  assert.ok(evaluated.warnings.some((warning) => warning.includes('#CYCLE!')));
  assert.ok(evaluated.warnings.some((warning) => warning.includes('#NAME?')));
  assert.equal(formatScalar(1234.5, 'currency'), '$1,234.50');
  assert.equal(formatScalar(0.125, 'percent'), '12.50%');
  assert.equal(formatScalar(1234.5, 'number'), '1,234.50');
  assert.equal(formatScalar(2.5, 'integer'), '3');
});

test('SHEET-UNIT-005: operations edit cells, style, and structure', () => {
  const source = workbook([{ name: 'Budget', cells: { A1: 'Item', B1: 'Cost', B2: 1200, B3: 800, B4: '=SUM(B2:B3)' } }]);
  const { workbook: updated, notes } = applySheetOperations(source, [
    { op: 'set', ref: 'A2', value: 'Hosting' },
    { op: 'set', ref: 'C2', formula: '=B2*1.2' },
    { op: 'set', ref: 'D2', value: 'Gone' },
    { op: 'set', ref: 'D2', value: null },
    { op: 'write', ref: 'A4', values: [['Support', 800], ['=B5', null]] },
    { op: 'format', range: 'A1:B1', style: { bold: true, background: '#fff2cc' } },
    { op: 'clear', range: 'A4:B4' },
    { op: 'add-sheet', name: 'Summary' },
    { op: 'rename-sheet', from: 'Summary', to: 'Totals' },
    { op: 'set-column-width', sheet: 'Budget', column: 'A', width: 160 },
    { op: 'delete-sheet', name: 'Totals' },
  ]);
  assert.ok(notes.length >= 10);
  assert.equal(updated.sheets.length, 1);
  assert.equal(updated.sheets[0].cells.A2?.value, 'Hosting');
  assert.equal(updated.sheets[0].cells.C2?.formula, '=B2*1.2');
  assert.equal(updated.sheets[0].cells.D2, undefined);
  assert.equal(updated.sheets[0].cells.A4, undefined);
  assert.equal(updated.sheets[0].cells.A1?.style?.bold, true);
  assert.equal(updated.sheets[0].columnWidths?.A, 160);
  assert.throws(() => applySheetOperations(source, [{ op: 'set', ref: 'A1', value: 1, formula: '=A1' }]), /both value and formula/);
  assert.throws(() => applySheetOperations(source, [{ op: 'delete-sheet', name: 'Budget' }]), /at least one sheet/);
  assert.throws(() => parseSheetOperations([{ op: 'nope' }]), /must be one of/);
});

test('SHEET-UNIT-006: csv and selection quotes use displayed values', () => {
  const parsed = parseSheetWorkbook(workbook([{
    name: 'Budget',
    cells: {
      A1: 'Item', B1: 'Cost', A2: 'Say "hi", now', B2: 12.5,
      A3: 'next', B3: { value: 0.25, style: { numberFormat: 'percent' } },
    },
  }]));
  const evaluated = evaluateWorkbook(parsed);
  const csv = sheetToCsv(parsed, evaluated);
  assert.equal(csv, 'Item,Cost\r\n"Say ""hi"", now",12.5\r\nnext,25.00%\r\n');
  const quote = selectionQuote(parsed, evaluated, 'Budget', 'A1:B2');
  assert.match(quote, /^Budget!A1:B2/);
  assert.match(quote, /Item\tCost/);
  assert.match(quote, /Say "hi", now\t12.5/);
  assert.deepEqual(sheetOverview(parsed).map((row) => row.name), ['Budget']);
});

test('SHEET-UNIT-007: xlsx output is a valid package with formulas, styles, and cached values', () => {
  const parsed = parseSheetWorkbook(workbook([
    {
      name: 'Budget',
      cells: {
        A1: { value: 'Item', style: { bold: true, background: '#fff2cc' } },
        B1: 'Cost',
        B2: 1200,
        B3: 800,
        B4: '=SUM(B2:B3)',
        C2: { value: 0.125, style: { numberFormat: 'percent', align: 'center' } },
      },
      columnWidths: { A: 160 },
    },
    { name: 'Summary', cells: { A1: 'Total', B1: '=Budget!B4*2' } },
  ]));
  const bytes = workbookToXlsx(parsed);
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const parts = unzipSync(new Uint8Array(bytes));
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    assert.ok(parts[name] !== undefined, 'missing ' + name);
  }
  const sheetOne = strFromU8(parts['xl/worksheets/sheet1.xml']);
  assert.match(sheetOne, /<f>SUM\(B2:B3\)<\/f><v>2000<\/v>/);
  assert.match(sheetOne, /<col min="1" max="1" width="22.86" customWidth="1"\/>/);
  assert.match(sheetOne, /<v>1200<\/v>/);
  const sheetTwo = strFromU8(parts['xl/worksheets/sheet2.xml']);
  assert.match(sheetTwo, /<f>Budget!B4\*2<\/f><v>4000<\/v>/);
  const styles = strFromU8(parts['xl/styles.xml']);
  assert.match(styles, /<b\/>/);
  assert.match(styles, /fgColor rgb="FFFFF2CC"/);
  assert.match(styles, /horizontal="center"/);
  assert.match(styles, /numFmtId="10"/);
  const workbookXml = strFromU8(parts['xl/workbook.xml']);
  assert.match(workbookXml, /name="Budget"/);
  assert.match(workbookXml, /name="Summary"/);
  assert.match(workbookXml, /fullCalcOnLoad="1"/);
});

test('SHEET-UNIT-008: diagnostic warnings name the sheet, cell, and code', () => {
  const parsed = parseSheetWorkbook(workbook([{ name: 'Budget', cells: { A1: '=1/0', A2: '=BAD(1)', A3: '=A1+1' } }]));
  const warnings = checkSheetWorkbook(parsed);
  assert.ok(warnings.some((warning) => warning.includes('Budget!A1') && warning.includes('#DIV/0!')));
  assert.ok(warnings.some((warning) => warning.includes('Budget!A2') && warning.includes('#NAME?')));
  assert.ok(warnings.some((warning) => warning.includes('Budget!A3') && warning.includes('#DIV/0!')));
});

test('SHEET-UNIT-009: the gap layer fills common Excel functions the parser stubs out', () => {
  const parsed = parseSheetWorkbook(workbook([{
    name: 'T',
    cells: {
      A1: 1, A2: 5, A3: 3,
      B1: 10, B2: 20, B3: 30, B4: 40,
      C1: '=MAX(A1:A3)', C2: '=MIN(A1:A3)', C3: '=MEDIAN(A1:A3)',
      C4: '=LARGE(A1:A3,2)', C5: '=SMALL(A1:A3,2)',
      C6: '=COUNTA(A1:A4)', C7: '=COUNTBLANK(A1:A4)',
      C8: '=MATCH(5,A1:A3,0)', C9: '=INDEX(A1:A3,MATCH(5,A1:A3,0))',
      C10: '=LOOKUP(4,A1:A3)', C11: '=RANK(3,A1:A3)',
      C12: '=STDEV(A1:A3)', C13: '=STDEVP(A1:A3)',
      C14: '=SUMIFS(B1:B4,A1:A4,">1")', C15: '=COUNTIFS(A1:A4,">1",A1:A4,"<5")',
      C16: '=AVERAGEIFS(B1:B4,A1:A4,">1")', C17: '=MAXIFS(B1:B4,A1:A4,">1")',
      C18: '=MINIFS(B1:B4,A1:A4,">1")', C19: '=TEXTJOIN(",",TRUE,A1:A3)',
      C20: '=XLOOKUP(5,A1:A3,B1:B3)', C21: '=UPPER("ab")', C22: '=VALUE("12.5")',
    },
  }]));
  const evaluated = evaluateWorkbook(parsed);
  const display = (ref) => evaluated.results.T[ref]?.display;
  const expected = {
    C1: '5', C2: '1', C3: '3', C4: '3', C5: '3',
    C6: '3', C7: '1', C8: '2', C9: '5', C10: '3', C11: '2',
    C12: '2', C13: '1.63299316186',
    C14: '50', C15: '1', C16: '25', C17: '30', C18: '20',
    C19: '1,5,3', C20: '20', C21: 'AB', C22: '12.5',
  };
  for (const [ref, value] of Object.entries(expected)) assert.equal(display(ref), value, ref);
  assert.deepEqual(evaluated.warnings, []);
});


test('SHEET-UNIT-010: later formula cells and cross-sheet INDEX resolve', () => {
  const parsed = parseSheetWorkbook(workbook([
    {
      name: 'Budget',
      cells: {
        A1: 'Item', A2: 'Hosting', A3: 'Support',
        B1: 'Cost', B2: 1200, B3: 800,
        C1: 'Double', C2: '=B2*2', C3: '=B3*2', C4: '=SUM(C2:C3)',
        D1: '=B4/2',
        B4: '=SUM(B2:B3)',
      },
    },
    {
      name: 'Summary',
      cells: {
        A1: '=INDEX(Budget!C2:C4,3)',
        A2: '=VLOOKUP("Hosting",Budget!A2:B4,2,FALSE)',
        A3: '=SUM(Budget!C2:C4)',
      },
    },
  ]));
  const evaluated = evaluateWorkbook(parsed);
  assert.equal(evaluated.results.Budget.D1?.display, '1000');
  assert.equal(evaluated.results.Summary.A1?.display, '4000');
  assert.equal(evaluated.results.Summary.A2?.display, '1200');
  assert.equal(evaluated.results.Summary.A3?.display, '8000');
  assert.deepEqual(evaluated.warnings, []);
});


test('SHEET-UNIT-011: readable colors are chosen for fills and low contrast is reported', () => {
  assert.equal(readableTextColor('#eceff4'), '#1f2933');
  assert.equal(readableTextColor('#1e1e1e'), '#ffffff');
  assert.ok(contrastRatio('#1f2933', '#eceff4') > 10);
  assert.ok(contrastRatio('#ffffff', '#eceff4') < 1.5);
  assert.equal(effectiveTextColor({ background: '#eceff4' }), '#1f2933');
  assert.equal(effectiveTextColor({ background: '#1e1e1e' }), '#ffffff');
  assert.equal(effectiveTextColor({ background: '#eceff4', color: '#ffffff' }), '#1f2933');
  assert.equal(effectiveTextColor({ background: '#eceff4', color: '#1f2933' }), '#1f2933');

  const parsed = parseSheetWorkbook(workbook([{
    name: 'Readable',
    cells: {
      A1: { value: 'Light', style: { bold: true, background: '#eceff4' } },
      A2: { value: 'Bad', style: { color: '#ffffff', background: '#eceff4' } },
      A3: { value: 'Good', style: { color: '#1f2933', background: '#eceff4' } },
    },
  }]));
  const warnings = checkSheetWorkbook(parsed);
  assert.equal(warnings.filter((warning) => warning.startsWith('low-contrast:')).length, 1);
  assert.match(warnings.find((warning) => warning.startsWith('low-contrast:')), /Readable!A2/);
  assert.ok(!warnings.some((warning) => warning.includes('Readable!A1')), 'a missing color is resolved automatically');
  assert.ok(!warnings.some((warning) => warning.includes('Readable!A3')), 'a readable pair must not warn');
});

test('SHEET-UNIT-012: XLSX export adds a readable font color to a filled cell', () => {
  const parsed = parseSheetWorkbook(workbook([{
    name: 'Export',
    cells: { A1: { value: 'Header', style: { bold: true, background: '#eceff4' } } },
  }]));
  const bytes = workbookToXlsx(parsed);
  const files = unzipSync(bytes);
  const styles = strFromU8(files['xl/styles.xml']);
  assert.match(styles, /rgb="FF1F2933"/);
});

