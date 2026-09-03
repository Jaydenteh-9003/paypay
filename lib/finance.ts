export const STORAGE_KEY = 'paypay.ledger.v1';
export const CURRENCIES = ['MYR', 'USD', 'SGD', 'GBP', 'EUR', 'AUD'] as const;
export const ROLES = ['Personal', 'University', 'Freelance', 'Internship'] as const;
export const EXPENSE_CATEGORIES = ['Food & drinks', 'Transport', 'Shopping', 'Education', 'Housing & bills', 'Health', 'Entertainment', 'Subscriptions', 'Other expense'] as const;
export const INCOME_CATEGORIES = ['Freelance payment', 'Internship pay', 'Allowance', 'Scholarship', 'Part-time work', 'Gift', 'Other income'] as const;
export type TransactionType = 'expense' | 'income';
export type Currency = typeof CURRENCIES[number];
export type Role = typeof ROLES[number];
export interface Transaction { id: string; type: TransactionType; amountCents: number; title: string; category: string; role: Role; date: string; note: string }
export interface Ledger { version: 1; currency: Currency; transactions: Transaction[]; budgets: Record<string, number> }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const emptyLedger = (): Ledger => ({ version: 1, currency: 'MYR', transactions: [], budgets: {} });
export function localDate(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export const categoriesFor = (type: TransactionType) => type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
export function parseAmount(value: string, allowZero = false): number {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter an amount with up to 2 decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents < (allowZero ? 0 : 1)) throw new Error('The amount must be greater than zero.');
  return cents;
}
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return year >= 2000 && year <= 2100 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function validateTransaction(value: unknown): Transaction {
  if (!object(value)) throw new Error('Invalid transaction.');
  const { id, type, amountCents, title, category, role, date, note } = value;
  if (typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid transaction ID.');
  if (type !== 'expense' && type !== 'income') throw new Error('Choose expense or income.');
  if (!Number.isSafeInteger(amountCents) || (amountCents as number) <= 0 || (amountCents as number) > 99999999999) throw new Error('Invalid transaction amount.');
  if (typeof title !== 'string' || !title.trim() || title.length > 80) throw new Error('Add a description of up to 80 characters.');
  if (typeof category !== 'string' || !(categoriesFor(type) as readonly string[]).includes(category)) throw new Error('Choose a valid category for this transaction.');
  if (!ROLES.includes(role as Role)) throw new Error('Choose a valid area of life.');
  if (!isValidDate(date)) throw new Error('Choose a valid date between 2000 and 2100.');
  if (typeof note !== 'string' || note.length > 300) throw new Error('Keep your note to 300 characters.');
  return { id, type, amountCents: amountCents as number, title: title.trim(), category, role: role as Role, date, note: note.trim() };
}
export function validateLedger(value: unknown): Ledger {
  if (!object(value) || value.version !== 1 || !CURRENCIES.includes(value.currency as Currency) || !Array.isArray(value.transactions) || !object(value.budgets)) throw new Error('This is not a valid Paypay backup (version 1).');
  if (value.transactions.length > 50000) throw new Error('This backup is too large (maximum 50,000 entries).');
  const transactions = value.transactions.map(validateTransaction);
  if (new Set(transactions.map(t => t.id)).size !== transactions.length) throw new Error('This backup contains duplicate transaction IDs.');
  const budgets: Record<string, number> = {};
  for (const [month, amount] of Object.entries(value.budgets)) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) || !Number.isSafeInteger(amount) || (amount as number) < 0 || (amount as number) > 99999999999) throw new Error('This backup contains an invalid monthly budget.');
    budgets[month] = amount as number;
  }
  return { version: 1, currency: value.currency as Currency, transactions, budgets };
}
export function readLedger(storage: StorageLike): Ledger {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return emptyLedger();
  try { return validateLedger(JSON.parse(raw)); } catch { throw new Error('Saved data could not be read. Export a recovery copy in Settings before restoring a valid backup. Your saved data has not been overwritten.'); }
}
export function updateLedger(storage: StorageLike, change: (current: Ledger) => Ledger): Ledger {
  const next = validateLedger(change(readLedger(storage)));
  try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { throw new Error('Your browser could not save this change. Storage may be full or disabled. Export a backup, free some space, and try again.'); }
  return next;
}
export function mergeBackup(current: Ledger, imported: Ledger): Ledger {
  if (current.currency !== imported.currency && (current.transactions.length || Object.keys(current.budgets).length)) throw new Error('This backup uses a different currency. Use a separate browser profile to keep currencies separate.');
  const existing = new Set(current.transactions.map(t => t.id));
  return validateLedger({ ...current, currency: imported.currency, transactions: [...current.transactions, ...imported.transactions.filter(t => !existing.has(t.id))], budgets: { ...imported.budgets, ...current.budgets } });
}
export function monthTransactions(transactions: Transaction[], month: string): Transaction[] { return transactions.filter(t => t.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); }
export function totals(transactions: Transaction[]) { const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amountCents, 0); const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amountCents, 0); return { income, expense, net: income - expense }; }
export function money(cents: number, currency: Currency) { return new Intl.NumberFormat('en-MY', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100); }
export const currencySymbol = (currency: Currency) => ({ MYR: 'RM', USD: '$', SGD: 'S$', GBP: '£', EUR: '€', AUD: 'A$' }[currency]);
export function shiftMonth(month: string, shift: number) { const [year, m] = month.split('-').map(Number); return localDate(new Date(year, m - 1 + shift, 1)).slice(0, 7); }
export function monthLabel(month: string) { return new Date(`${month}-01T12:00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' }); }
export function weeklyCashflow(transactions: Transaction[], month: string) {
  const [year, m] = month.split('-').map(Number); const days = new Date(year, m, 0).getDate();
  return Array.from({ length: Math.ceil(days / 7) }, (_, i) => { const start = i * 7 + 1, end = Math.min(start + 6, days); const entries = transactions.filter(t => t.date.startsWith(month) && +t.date.slice(-2) >= start && +t.date.slice(-2) <= end); const sum = totals(entries); return { week: `${start}–${end}`, income: sum.income / 100, expense: sum.expense / 100 }; });
}
export function csvExport(ledger: Ledger): string {
  const escape = (value: string) => `"${(/^[=+\-@\t\r\n]/.test(value) ? "'" : '') + value.replace(/"/g, '""')}"`;
  return '\uFEFF' + [['Date', 'Type', 'Description', 'Category', 'Area', 'Amount', 'Currency', 'Note'], ...ledger.transactions.map(t => [t.date, t.type, t.title, t.category, t.role, (t.amountCents / 100).toFixed(2), ledger.currency, t.note])].map(row => row.map(escape).join(',')).join('\r\n');
}
export function sampleLedger(month: string): Ledger {
  const entries: Array<[TransactionType, number, string, string, Role, number]> = [
    ['income', 120000, 'Monthly intern allowance', 'Internship pay', 'Internship', 1],
    ['income', 85000, 'Brand identity project', 'Freelance payment', 'Freelance', 8],
    ['income', 50000, 'A little help from home', 'Allowance', 'University', 15],
    ['expense', 1250, 'Lunch between lectures', 'Food & drinks', 'University', 3],
    ['expense', 1800, 'Coffee & a catch-up', 'Food & drinks', 'Personal', 6],
    ['expense', 4500, 'Weekly groceries', 'Food & drinks', 'Personal', 10],
    ['expense', 1200, 'Ride to the office', 'Transport', 'Internship', 11],
    ['expense', 1590, 'Spotify Student', 'Subscriptions', 'University', 12],
    ['expense', 65000, 'Room rent', 'Housing & bills', 'University', 2],
    ['expense', 4500, 'Design resources', 'Education', 'Freelance', 19],
    ['expense', 8990, 'A new everyday bag', 'Shopping', 'Personal', 22],
    ['expense', 2400, 'Dinner with friends', 'Food & drinks', 'Personal', 25],
    ['expense', 1600, 'Train & bus rides', 'Transport', 'University', 27],
  ];
  return { version: 1, currency: 'MYR', budgets: { [month]: 150000 }, transactions: entries.map(([type, amountCents, title, category, role, day], i) => ({ id: `sample-${i}`, type, amountCents, title, category, role, date: `${month}-${String(day).padStart(2, '0')}`, note: '' })) };
}
