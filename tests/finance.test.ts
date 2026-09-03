import test from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, csvExport, emptyLedger, isValidDate, localDate, mergeBackup, monthTransactions, parseAmount, readLedger, shiftMonth, totals, updateLedger, validateLedger, validateTransaction, weeklyCashflow, type Transaction } from '../lib/finance.ts';

const entry: Transaction = { id: 'entry-1', type: 'expense', amountCents: 1250, title: 'Lunch', category: 'Food & drinks', role: 'University', date: '2026-09-03', note: '' };
function memoryStorage(raw: string | null = null) { let data = raw; return { getItem: (_key: string) => data, setItem: (_key: string, value: string) => { data = value; } }; }

test('money uses exact integer cents and rejects malformed or overflowing input', () => {
  assert.equal(parseAmount('0.29'), 29); assert.equal(parseAmount('18.5'), 1850); assert.equal(parseAmount(' 12 '), 1200); assert.equal(parseAmount('0', true), 0);
  for (const value of ['-1', '0', 'NaN', '1e5', '12.345', '1,234', 'Infinity', '', '1000000000']) assert.throws(() => parseAmount(value));
});
test('real calendar dates, leap years and local month boundaries are respected', () => {
  assert.ok(isValidDate('2024-02-29')); assert.ok(!isValidDate('2026-02-29')); assert.ok(!isValidDate('2026-04-31')); assert.ok(!isValidDate('2026-13-01')); assert.ok(!isValidDate('0099-01-01'));
  assert.equal(localDate(new Date(2026, 8, 1, 0, 1)), '2026-09-01'); assert.equal(shiftMonth('2026-01', -1), '2025-12'); assert.equal(shiftMonth('2026-12', 1), '2027-01');
});
test('entries survive reload, edit and deletion without losing another tab’s additions', () => {
  const storage = memoryStorage();
  updateLedger(storage, current => ({ ...current, transactions: [entry] }));
  assert.deepEqual(readLedger(storage).transactions, [entry]);
  updateLedger(storage, current => ({ ...current, transactions: [...current.transactions, { ...entry, id: 'entry-2' }] }));
  updateLedger(storage, current => ({ ...current, transactions: current.transactions.map(t => t.id === entry.id ? { ...t, amountCents: 1350 } : t) }));
  assert.equal(readLedger(storage).transactions.length, 2); assert.equal(readLedger(storage).transactions[0].amountCents, 1350);
  updateLedger(storage, current => ({ ...current, transactions: current.transactions.filter(t => t.id !== entry.id) }));
  assert.equal(readLedger(storage).transactions[0].id, 'entry-2');
});
test('storage failures do not return success or overwrite corrupted data', () => {
  const bad = memoryStorage('{broken'); assert.throws(() => updateLedger(bad, () => emptyLedger()), /not been overwritten/); assert.equal(bad.getItem(STORAGE_KEY), '{broken');
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } }; assert.throws(() => updateLedger(full, () => ({ ...emptyLedger(), transactions: [entry] })), /could not save/);
});
test('backup validation rejects bad amounts, categories, duplicates, dates and budgets', () => {
  const valid = { ...emptyLedger(), transactions: [entry] }; assert.deepEqual(validateLedger(JSON.parse(JSON.stringify(valid))), valid);
  for (const value of [{ ...valid, version: 2 }, { ...valid, transactions: [entry, entry] }, { ...valid, budgets: { '2026-13': 100 } }, { ...valid, transactions: [{ ...entry, amountCents: -100 }] }, { ...valid, transactions: [{ ...entry, amountCents: 12.5 }] }, { ...valid, transactions: [{ ...entry, category: 'Allowance' }] }, { ...valid, transactions: [{ ...entry, date: '2026-02-30' }] }]) assert.throws(() => validateLedger(value));
  assert.throws(() => validateTransaction({ ...entry, title: '   ' }));
});
test('restore merges unique IDs and preserves existing entries and budgets', () => {
  const current = { ...emptyLedger(), transactions: [entry], budgets: { '2026-09': 100000 } };
  const imported = { ...emptyLedger(), transactions: [{ ...entry, amountCents: 9900 }, { ...entry, id: 'entry-2' }], budgets: { '2026-09': 200000, '2026-10': 150000 } };
  const merged = mergeBackup(current, imported); assert.equal(merged.transactions.length, 2); assert.equal(merged.transactions[0].amountCents, 1250); assert.equal(merged.budgets['2026-09'], 100000); assert.equal(merged.budgets['2026-10'], 150000);
  assert.deepEqual(mergeBackup(merged, imported), merged); assert.throws(() => mergeBackup(current, { ...imported, currency: 'USD' }), /different currency/);
});
test('monthly totals and weekly chart agree, including the last day', () => {
  const entries: Transaction[] = [entry, { ...entry, id: 'entry-2', date: '2026-09-30', amountCents: 750 }, { ...entry, id: 'entry-3', date: '2026-08-31' }, { ...entry, id: 'entry-4', type: 'income', category: 'Internship pay', amountCents: 120000 }];
  const selected = monthTransactions(entries, '2026-09'); assert.equal(selected.length, 3); assert.deepEqual(totals(selected), { expense: 2000, income: 120000, net: 118000 });
  const weeks = weeklyCashflow(entries, '2026-09'); assert.equal(weeks.length, 5); assert.equal(weeks[4].expense, 7.5); assert.equal(weeks.reduce((sum, w) => sum + w.expense, 0), 20); assert.equal(weeklyCashflow([], '2026-02').length, 4);
});
test('CSV escapes quotes, newlines and spreadsheet formulas', () => {
  const csv = csvExport({ ...emptyLedger(), transactions: [{ ...entry, title: '=SUM(1,2)', note: 'A "quote"\nand a line' }] });
  assert.ok(csv.includes('"\'=SUM(1,2)"')); assert.ok(csv.includes('"A ""quote""\nand a line"')); assert.ok(csv.includes('"12.50","MYR"'));
});
