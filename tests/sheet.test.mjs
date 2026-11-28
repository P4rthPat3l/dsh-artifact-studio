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
  sheetRowHeights,
  sheetToCsv,
  sheetValues,
  wrappedLineCount,
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

test('SHEET-UNIT-013: a bounded values read returns evaluated cells and truncates', () => {
  const parsed = parseSheetWorkbook(workbook([{ name: 'Budget', cells: { A1: 'Item', B1: 'Cost', C2: '=1/0', B2: 1200, B3: 800, B4: '=SUM(B2:B3)' } }]));
  const evaluated = evaluateWorkbook(parsed);
  const values = sheetValues(parsed, evaluated, 'Budget', 'A1:B4');
  assert.equal(values.sheet, 'Budget');
  assert.equal(values.range, 'A1:B4');
  assert.equal(values.truncated, false);
  assert.equal(values.cells.length, 8);
  const total = values.cells.find((cell) => cell.ref === 'B4');
  assert.equal(total.value, 2000);
  assert.equal(total.display, '2000');
  const failed = sheetValues(parsed, evaluated, 'Budget', 'C2').cells[0];
  assert.equal(failed.error, '#DIV/0!');
  assert.equal(failed.value, null);
  assert.equal(sheetValues(parsed, evaluated).range, 'A1:C4');
  const huge = parseSheetWorkbook(workbook([{ name: 'Wide', cells: { A1: 1, CV5000: 2 } }]));
  const bounded = sheetValues(huge, evaluateWorkbook(huge), 'Wide');
  assert.equal(bounded.cells.length, 500);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.range, 'A1:CV5');
  assert.throws(() => sheetValues(parsed, evaluated, 'Missing'), /No sheet is named/);
  assert.throws(() => sheetValues(parsed, evaluated, 'Budget', 'nope'), /is not a valid range or cell/);
});

test('SHEET-UNIT-014: renaming a sheet rewrites its references and nothing else', () => {
  const source = workbook([
    { name: 'Budget', cells: { B4: '=SUM(B2:B3)', B2: 1200, B3: 800 } },
    {
      name: 'Summary',
      cells: {
        A1: '=Budget!B4',
        A2: '=budget!B4',
        A3: "='Budget'!B4",
        A4: '=Budget2!B4',
        A5: '="Budget!B4"',
        A6: '=SUM(Budget!B2:B3)',
        A7: '=Budget:Summary!A1',
        A8: '=#REF!',
      },
    },
  ]);
  const renamed = applySheetOperations(source, [{ op: 'rename-sheet', from: 'Budget', to: 'Q1 Totals' }]).workbook;
  const cells = renamed.sheets[1].cells;
  assert.equal(cells.A1.formula, "='Q1 Totals'!B4");
  assert.equal(cells.A2.formula, "='Q1 Totals'!B4");
  assert.equal(cells.A3.formula, "='Q1 Totals'!B4");
  assert.equal(cells.A4.formula, '=Budget2!B4');
  assert.equal(cells.A5.formula, '="Budget!B4"');
  assert.equal(cells.A6.formula, "=SUM('Q1 Totals'!B2:B3)");
  assert.equal(cells.A7.formula, '=Budget:Summary!A1');
  assert.equal(cells.A8.formula, '=#REF!');
  const result = evaluateWorkbook(renamed).results.Summary;
  assert.equal(result.A1.value, 2000);
  assert.equal(renamed.sheets[0].cells.B4.formula, '=SUM(B2:B3)');
  const plain = applySheetOperations(source, [{ op: 'rename-sheet', from: 'Budget', to: 'Costs' }]).workbook;
  assert.equal(plain.sheets[1].cells.A1.formula, '=Costs!B4');
});

test('SHEET-UNIT-015: merges normalise, refuse overlap, and unmerge', () => {
  const parsed = parseSheetWorkbook(workbook([{
    name: 'Budget',
    cells: { A1: 'Quarter', B1: 'Q1', C1: 'Q2', D2: 'Notes', D3: 'kept', D4: 'dropped' },
    merges: ['B1:C1'],
  }]));
  assert.deepEqual(parsed.sheets[0].merges, ['B1:C1']);
  const reordered = parseSheetWorkbook(workbook([{ name: 'Budget', cells: {}, merges: ['C4:D5', 'A1:B1'] }]));
  assert.deepEqual(reordered.sheets[0].merges, ['A1:B1', 'C4:D5']);
  assert.throws(() => parseSheetWorkbook(workbook([{ name: 'A', cells: {}, merges: ['B1:B1'] }])), /one cell/);
  assert.throws(() => parseSheetWorkbook(workbook([{ name: 'A', cells: {}, merges: ['A1:B1', 'B1:C1'] }])), /overlaps/);
  assert.throws(() => parseSheetWorkbook(workbook([{ name: 'A', cells: {}, merges: ['nope'] }])), /invalid range/);
  const merged = applySheetOperations(workbook([{
    name: 'Budget',
    cells: { A1: 'Quarter', B1: 'Q1', C1: 'Q2', D3: 'kept', D4: 'gone' },
  }]), [{ op: 'merge', range: 'A1:C1' }]).workbook;
  assert.deepEqual(merged.sheets[0].merges, ['A1:C1']);
  assert.equal(merged.sheets[0].cells.A1.value, 'Quarter');
  assert.equal(merged.sheets[0].cells.B1, undefined);
  assert.equal(merged.sheets[0].cells.C1, undefined);
  assert.equal(merged.sheets[0].cells.D3.value, 'kept');
  assert.throws(() => applySheetOperations(serializeSheetWorkbook(merged), [{ op: 'merge', range: 'B1:D1' }]), /overlaps/);
  assert.throws(() => applySheetOperations(serializeSheetWorkbook(merged), [{ op: 'merge', range: 'A2:A2' }]), /one cell/);
  const unmerged = applySheetOperations(serializeSheetWorkbook(merged), [{ op: 'unmerge', range: 'B1' }]).workbook;
  assert.equal(unmerged.sheets[0].merges, undefined);
  assert.throws(() => applySheetOperations(serializeSheetWorkbook(unmerged), [{ op: 'unmerge', range: 'C3' }]), /No merged range/);
  assert.throws(() => parseSheetOperations([{ op: 'merge', range: 'A1' }]), /must be a range/);
});

test('SHEET-UNIT-016: xlsx carries merged ranges', () => {
  const parsed = parseSheetWorkbook(workbook([{ name: 'Budget', cells: { A1: 'Quarter', B1: 'Q1', B2: 1200 }, merges: ['A1:B1'] }]));
  const parts = unzipSync(new Uint8Array(workbookToXlsx(parsed)));
  const sheetXml = strFromU8(parts['xl/worksheets/sheet1.xml']);
  assert.match(sheetXml, /<mergeCells count="1"><mergeCell ref="A1:B1"\/><\/mergeCells>/);
  assert.ok(sheetXml.indexOf('<') >= 0);
  assert.ok(sheetXml.indexOf('<mergeCells') > sheetXml.indexOf('</sheetData>'), 'mergeCells must follow sheetData');
});

test('SHEET-UNIT-017: wrapped text grows its row and exports as wrapText', () => {
  const text = 'A long note that needs wrapping in a narrow column';
  const parsed = parseSheetWorkbook(workbook([{
    name: 'Budget',
    cells: { A1: { value: text, style: { wrap: true, bold: true } }, B1: 'Plain' },
  }]));
  assert.equal(parsed.sheets[0].cells.A1.style.wrap, true);
  assert.deepEqual(JSON.parse(serializeSheetWorkbook(parsed)).sheets[0].cells.A1.style, { bold: true, wrap: true });
  const perLine = Math.floor((96 - 12) / 6.6);
  const lines = wrappedLineCount(text, 96);
  assert.equal(lines, Math.ceil(text.length / perLine));
  assert.equal(wrappedLineCount('8', 96), 1);
  assert.equal(wrappedLineCount('', 96), 1);
  const evaluated = evaluateWorkbook(parsed);
  const heights = sheetRowHeights(parsed.sheets[0], evaluated);
  const expected = Math.min(400, Math.max(28, lines * 16 + 10));
  assert.equal(heights.get(1), expected);
  assert.equal(heights.get(2), undefined);
  const narrow = parseSheetWorkbook(workbook([{ name: 'Budget', cells: { A1: { value: text, style: { wrap: true } } }, columnWidths: { A: 24 } }]));
  const tall = sheetRowHeights(narrow.sheets[0], evaluateWorkbook(narrow));
  assert.ok((tall.get(1) ?? 0) > expected);
  assert.ok((tall.get(1) ?? 0) <= 400);
  const parts = unzipSync(new Uint8Array(workbookToXlsx(parsed)));
  const sheetXml = strFromU8(parts['xl/worksheets/sheet1.xml']);
  const stylesXml = strFromU8(parts['xl/styles.xml']);
  assert.match(stylesXml, /wrapText="1"/);
  assert.match(stylesXml, /applyAlignment="1"/);
  const xmlHeight = Math.round(expected * 0.75 * 100) / 100;
  assert.ok(sheetXml.includes('<row r="1" ht="' + String(xmlHeight) + '" customHeight="1">'), sheetXml.slice(0, 400));
  assert.throws(() => parseSheetWorkbook(workbook([{ name: 'A', cells: { A1: { value: 1, style: { wrap: 'yes' } } } }])), /wrap must be true or false/);
  const cleared = applySheetOperations(serializeSheetWorkbook(parsed), [{ op: 'format', range: 'A1:A1', style: { wrap: null } }]).workbook;
  assert.equal(cleared.sheets[0].cells.A1.style?.wrap, undefined);
  assert.equal(cleared.sheets[0].cells.A1.style?.bold, true);
});

test('SHEET-UNIT-018: row and column edits shift cells, merges, widths, and references', () => {
  const source = workbook([
    {
      name: 'Budget',
      cells: {
        A1: 'Item', B1: 'Cost', C1: 'Note',
        A2: 'Hosting', B2: 1200,
        A3: 'Support', B3: 800,
        B4: '=SUM(B2:B3)',
        D2: '=$B$2*2',
        E1: '=Sheet2!A1',
      },
      columnWidths: { A: 160, B: 140 },
      merges: ['A1:C1', 'D2:D3'],
    },
    { name: 'Sheet2', cells: { A1: '=Budget!B4', A2: '="Budget!B4"', A3: '=LOG10(100)', A4: '=Budget!A2', A5: '=Budget!$A$2' } },
  ]);

  const rows = applySheetOperations(source, [{ op: 'insert-rows', at: 2, count: 1 }]).workbook;
  const inserted = rows.sheets[0];
  assert.equal(inserted.cells.A1.value, 'Item');
  assert.equal(inserted.cells.A3.value, 'Hosting');
  assert.equal(inserted.cells.B3.value, 1200);
  assert.equal(inserted.cells.B5.formula, '=SUM(B3:B4)');
  assert.equal(inserted.cells.D3.formula, '=$B$3*2');
  assert.deepEqual(inserted.merges, ['A1:C1', 'D3:D4']);
  assert.equal(rows.sheets[1].cells.A1.formula, '=Budget!B5');
  assert.equal(rows.sheets[1].cells.A2.formula, '="Budget!B4"');
  assert.equal(rows.sheets[1].cells.A3.formula, '=LOG10(100)');
  assert.equal(rows.sheets[1].cells.A4.formula, '=Budget!A3');
  assert.equal(rows.sheets[1].cells.A5.formula, '=Budget!$A$3');

  const columns = applySheetOperations(source, [{ op: 'insert-columns', at: 'B', count: 1 }]).workbook;
  const widened = columns.sheets[0];
  assert.equal(widened.cells.A1.value, 'Item');
  assert.equal(widened.cells.C1.value, 'Cost');
  assert.equal(widened.cells.C2.value, 1200);
  assert.equal(widened.cells.C4.formula, '=SUM(C2:C3)');
  assert.equal(widened.cells.E2.formula, '=$C$2*2');
  assert.deepEqual(widened.columnWidths, { A: 160, C: 140 });
  assert.deepEqual(widened.merges, ['A1:D1', 'E2:E3']);
  assert.equal(columns.sheets[1].cells.A1.formula, '=Budget!C4');
  assert.equal(columns.sheets[1].cells.A5.formula, '=Budget!$A$2');

  const deletedRows = applySheetOperations(source, [{ op: 'delete-rows', at: 2, count: 1 }]).workbook;
  const shortened = deletedRows.sheets[0];
  assert.equal(shortened.cells.A2.value, 'Support');
  assert.equal(shortened.cells.B2.value, 800);
  assert.equal(shortened.cells.B3.formula, '=SUM(B2:B2)');
  assert.equal(shortened.cells.D2, undefined);
  assert.deepEqual(shortened.merges, ['A1:C1']);
  assert.equal(deletedRows.sheets[1].cells.A1.formula, '=Budget!B3');
  assert.equal(deletedRows.sheets[1].cells.A4.formula, '=Budget!#REF!');
  assert.equal(deletedRows.sheets[1].cells.A5.formula, '=Budget!#REF!');

  const deletedColumns = applySheetOperations(source, [{ op: 'delete-columns', at: 'A', count: 1 }]).workbook;
  const narrowed = deletedColumns.sheets[0];
  assert.equal(narrowed.cells.A1.value, 'Cost');
  assert.equal(narrowed.cells.A2.value, 1200);
  assert.equal(narrowed.cells.A4.formula, '=SUM(A2:A3)');
  assert.deepEqual(narrowed.columnWidths, { A: 140 });
  assert.deepEqual(narrowed.merges, ['A1:B1', 'C2:C3']);
  assert.equal(deletedColumns.sheets[1].cells.A1.formula, '=Budget!A4');
  assert.equal(deletedColumns.sheets[1].cells.A4.formula, '=Budget!#REF!');

  assert.throws(() => parseSheetOperations([{ op: 'insert-rows', at: 0 }]), /row number/);
  assert.throws(() => parseSheetOperations([{ op: 'insert-rows', at: 5000, count: 2 }]), /last row/);
  assert.throws(() => parseSheetOperations([{ op: 'insert-columns', at: 'CV', count: 2 }]), /last column/);
  assert.throws(() => applySheetOperations(workbook([{ name: 'Full', cells: { A5000: 1 } }]), [{ op: 'insert-rows', at: 4999, count: 2 }]), /past row 5000/);
});

test('SHEET-UNIT-019: moving rows and columns carries cells, widths, merges, and references', () => {
  const source = workbook([
    {
      name: 'Order',
      cells: {
        A1: 'one', A2: 'two', A3: 'three', A4: 'four',
        B1: 10, B2: 20, B3: 30, B4: 40,
        C2: '=A2', C3: '=A3', C4: '=A4',
      },
      columnWidths: { A: 160, B: 140, C: 120 },
      merges: ['A1:B1'],
    },
    { name: 'Other', cells: { A1: '=Order!A4', A2: '=SUM(Order!A1:A4)', A3: '="Order!A4"', A4: '=Order!A3' } },
  ]);

  const moved = applySheetOperations(source, [{ op: 'move-rows', at: 4, count: 1, to: 2 }]).workbook;
  const rows = moved.sheets[0];
  assert.deepEqual([rows.cells.A1.value, rows.cells.A2.value, rows.cells.A3.value, rows.cells.A4.value], ['one', 'four', 'two', 'three']);
  assert.deepEqual([rows.cells.B1.value, rows.cells.B2.value, rows.cells.B3.value, rows.cells.B4.value], [10, 40, 20, 30]);
  assert.deepEqual(rows.cells.C2, { formula: '=A2' });
  assert.deepEqual(rows.cells.C3, { formula: '=A3' });
  assert.deepEqual(rows.cells.C4, { formula: '=A4' });
  assert.deepEqual(rows.merges, ['A1:B1']);
  assert.equal(moved.sheets[1].cells.A1.formula, '=Order!A2');
  assert.equal(moved.sheets[1].cells.A2.formula, '=SUM(Order!A1:A4)');
  assert.equal(moved.sheets[1].cells.A3.formula, '="Order!A4"');
  assert.equal(moved.sheets[1].cells.A4.formula, '=Order!A4');

  const columns = applySheetOperations(source, [{ op: 'move-columns', at: 'C', to: 'A', count: 1 }]).workbook;
  const wide = columns.sheets[0];
  assert.equal(wide.cells.A1, undefined);
  assert.equal(wide.cells.B1.value, 'one');
  assert.equal(wide.cells.C1.value, 10);
  const widths = wide.columnWidths;
  assert.deepEqual(widths, { A: 120, B: 160, C: 140 });
  assert.deepEqual(wide.merges, ['B1:C1']);
  assert.equal(columns.sheets[1].cells.A1.formula, '=Order!B4');

  const order = workbook([{ name: 'Numbers', cells: { A1: 1, A2: 2, A3: 3, A4: 4, A5: 5 } }]);
  const block = applySheetOperations(order, [{ op: 'move-rows', at: 2, count: 2, to: 3 }]).workbook.sheets[0];
  assert.deepEqual([block.cells.A1.value, block.cells.A2.value, block.cells.A3.value, block.cells.A4.value, block.cells.A5.value], [1, 4, 2, 3, 5]);

  assert.throws(() => parseSheetOperations([{ op: 'move-rows', at: 1, count: 2, to: 5000 }]), /last row/);
  assert.throws(() => parseSheetOperations([{ op: 'move-columns', at: 'A', count: 2, to: 'CV' }]), /last column/);
  assert.throws(() => parseSheetOperations([{ op: 'move-rows', at: 0, to: 2 }]), /row number/);
  assert.deepEqual(parseSheetOperations([{ op: 'move-rows', at: 4, to: 2 }])[0], { op: 'move-rows', at: 4, count: 1, to: 2 });
});
