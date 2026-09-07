import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDate, parseOcrText } from '../lib/ocr.ts';

test('receipt detection imports only the strongest final total', () => {
  const text = `KOPI CAMPUS\nTAX INVOICE / RECEIPT\n05/09/2026 13:42\nLatte RM 8.90\nSandwich RM 9.00\nSUBTOTAL RM 17.90\nSST RM 1.10\nGRAND TOTAL RM 19.00\nCASH RM 20.00\nCHANGE RM 1.00`;
  const result = parseOcrText(text);
  assert.equal(result.documentType, 'receipt');
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].amountCents, 1900);
  assert.equal(result.drafts[0].date, '2026-09-05');
  assert.equal(result.drafts[0].type, 'expense');
});

test('a receipt without a labelled final total creates no draft', () => {
  const result = parseOcrText('RECEIPT\nNasi lemak RM 7.50\nCoffee RM 3.00\nCASH RM 20.00\nCHANGE RM 9.50', 'receipt');
  assert.deepEqual(result.drafts, []);
});

test('a final-total amount on the next OCR line is still one receipt draft', () => {
  const result = parseOcrText('RECEIPT\nItem RM 4.00\nSUBTOTAL RM 4.00\nAMOUNT DUE\nRM 4.25', 'receipt');
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].amountCents, 425);
});

test('MAE-style history extracts expenses and income but skips balances', () => {
  const text = `Transaction History\n05/09/2026\nMCDONALDS BANGSAR\n-RM 12.50\n06/09/2026\nDuitNow Received CLIENT PROJECT\n+ RM 300.00\nAvailable Balance RM 1,240.30`;
  const result = parseOcrText(text);
  assert.equal(result.documentType, 'transactions');
  assert.equal(result.drafts.length, 2);
  assert.deepEqual(result.drafts.map(draft => [draft.type, draft.amountCents, draft.date]), [['expense', 1250, '2026-09-05'], ['income', 30000, '2026-09-06']]);
});

test('TNG-style single rows and common dates are recognized', () => {
  const result = parseOcrText('08 Sep 2026 Grab Transport - RM 14.20\n09/09/26 Cashback +RM 2.50', 'transactions');
  assert.equal(result.drafts.length, 2);
  assert.equal(result.drafts[0].category, 'Transport');
  assert.equal(result.drafts[1].type, 'income');
  assert.equal(extractDate('09/09/26', '2000-01-01'), '2026-09-09');
});

test('transaction OCR is capped and ignores malformed whole-number prices', () => {
  const rows = Array.from({ length: 140 }, (_, index) => `01/09/2026 Purchase ${index} -RM 1.00`).join('\n');
  assert.equal(parseOcrText(rows, 'transactions').drafts.length, 100);
  assert.equal(parseOcrText('01/09/2026 Purchase RM 200', 'transactions').drafts.length, 0);
});
