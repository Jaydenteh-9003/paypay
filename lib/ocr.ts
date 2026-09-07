import { localDate, type Role, type TransactionType } from './finance.ts';

export type OcrDocumentType = 'receipt' | 'transactions';
export type OcrMode = 'auto' | OcrDocumentType;
export interface OcrDraft {
  sourceLine: string;
  type: TransactionType;
  amountCents: number;
  title: string;
  category: string;
  role: Role;
  date: string;
}
export interface OcrParseResult { documentType: OcrDocumentType; drafts: OcrDraft[] }

const monthNumbers: Record<string, string> = { jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12' };
const moneyPattern = /(?:\b(?:RM|MYR)\s*)?([+\-−]?\s*)(\d{1,3}(?:[ ,]\d{3})*|\d+)[.,](\d{2})(?:\s*(CR|DR))?/gi;
const receiptExclude = /\b(sub\s*total|subtotal|tax|sst|gst|service\s*(?:charge|tax)|discount|cash|tendered|change|balance|rounding|item|unit\s*price)\b/i;
const balanceLine = /\b(available\s+balance|current\s+balance|opening\s+balance|closing\s+balance|account\s+balance|wallet\s+balance|balance\s+brought)\b/i;

function linesOf(text: string) { return text.split(/\r?\n/).map(line => line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 1200); }
function amountMatches(line: string) {
  return [...line.matchAll(moneyPattern)].map(match => ({ raw: match[0], sign: match[1].replace(/\s/g, ''), cents: Number(match[2].replace(/[ ,]/g, '')) * 100 + Number(match[3]), suffix: match[4]?.toUpperCase() ?? '' })).filter(item => Number.isSafeInteger(item.cents) && item.cents > 0 && item.cents <= 99999999999);
}
function pad(value: string | number) { return String(value).padStart(2, '0'); }
function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day, 12);
  return year >= 2000 && year <= 2100 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? `${year}-${pad(month)}-${pad(day)}` : null;
}
export function extractDate(value: string, fallback = localDate()): string {
  let match = value.match(/\b(20\d{2})[/-](0?[1-9]|1[0-2])[/-]([0-2]?\d|3[01])\b/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3])) ?? fallback;
  match = value.match(/\b([0-2]?\d|3[01])[/-](0?[1-9]|1[0-2])[/-]((?:20)?\d{2})\b/);
  if (match) { const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]); return validDate(year, Number(match[2]), Number(match[1])) ?? fallback; }
  match = value.match(/\b([0-2]?\d|3[01])\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[,\s]+(20\d{2})\b/i);
  if (match) return validDate(Number(match[3]), Number(monthNumbers[match[2].toLowerCase()]), Number(match[1])) ?? fallback;
  return fallback;
}
function categoryFor(title: string, type: TransactionType) {
  const value = title.toLowerCase();
  if (type === 'income') {
    if (/freelance|client|project|invoice/.test(value)) return 'Freelance payment';
    if (/salary|payroll|intern/.test(value)) return 'Internship pay';
    if (/allowance/.test(value)) return 'Allowance';
    if (/scholarship|bursary/.test(value)) return 'Scholarship';
    return 'Other income';
  }
  if (/food|cafe|coffee|restaurant|mcd|kfc|grabfood|foodpanda|mart|grocer/.test(value)) return 'Food & drinks';
  if (/grab|rapid|mrt|lrt|ktm|bus|train|petrol|fuel|parking|toll/.test(value)) return 'Transport';
  if (/tuition|book|course|university|college|school/.test(value)) return 'Education';
  if (/rent|electric|water|internet|telco|bill/.test(value)) return 'Housing & bills';
  if (/pharmacy|clinic|hospital|health/.test(value)) return 'Health';
  if (/netflix|spotify|subscription/.test(value)) return 'Subscriptions';
  return 'Other expense';
}
function roleFor(title: string): Role {
  if (/intern|office|salary|payroll/.test(title.toLowerCase())) return 'Internship';
  if (/freelance|client|invoice|project/.test(title.toLowerCase())) return 'Freelance';
  if (/university|campus|college|tuition|scholarship/.test(title.toLowerCase())) return 'University';
  return 'Personal';
}
function cleanTitle(value: string, fallback: string) {
  const title = value.replace(moneyPattern, '').replace(/\b(?:20\d{2}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-](?:20)?\d{2})\b/g, '').replace(/\b(?:successful|success|completed|pending|reference|ref\.?|transaction)\b/gi, '').replace(/^[\s:·•—-]+|[\s:·•—-]+$/g, '').replace(/\s+/g, ' ').trim();
  return (title || fallback).slice(0, 80);
}
function receiptPriority(line: string) {
  if (receiptExclude.test(line)) return 0;
  if (/\b(grand\s+total|amount\s+due|total\s+amount|total\s+bayar|jumlah\s+(?:besar|keseluruhan)|net\s+total)\b/i.test(line)) return 4;
  if (/\b(total|jumlah)\b/i.test(line)) return 2;
  return 0;
}
function looksLikeReceipt(lines: string[]) {
  const joined = lines.join('\n');
  const signals = [/\breceipt\b/i, /\bsubtotal\b/i, /\b(?:sst|gst|tax)\b/i, /\bchange\b/i, /\bcash(?:ier)?\b/i, /\bqty\b/i].filter(pattern => pattern.test(joined)).length;
  const datedMoneyRows = lines.filter(line => amountMatches(line).length && extractDate(line, '') !== '').length;
  return signals >= 2 || (lines.some(line => receiptPriority(line) >= 4) && datedMoneyRows < 2);
}
function parseReceipt(lines: string[]): OcrDraft[] {
  const choices = lines.flatMap((line, index) => {
    const priority = receiptPriority(line);
    if (!priority) return [];
    const amounts = amountMatches(line);
    if (amounts.length) return [{ line, index, priority, amount: amounts.at(-1)! }];
    const nextIndex = lines.slice(index + 1, index + 3).findIndex(next => amountMatches(next).length > 0 && !receiptExclude.test(next));
    if (nextIndex < 0) return [];
    const amountLine = lines[index + nextIndex + 1];
    return [{ line: `${line} ${amountLine}`, index, priority, amount: amountMatches(amountLine).at(-1)! }];
  }).sort((a, b) => b.priority - a.priority || b.index - a.index);
  const choice = choices[0];
  if (!choice) return [];
  const merchant = lines.find(line => !amountMatches(line).length && !/receipt|invoice|tax|date|time|cashier|welcome|thank/i.test(line) && line.length >= 3 && line.length <= 70) ?? 'Receipt purchase';
  const dateSource = lines.find(line => extractDate(line, '') !== '') ?? '';
  const title = cleanTitle(merchant, 'Receipt purchase');
  return [{ sourceLine: choice.line, type: 'expense', amountCents: choice.amount.cents, title, category: categoryFor(title, 'expense'), role: roleFor(title), date: extractDate(dateSource) }];
}
function isIncome(line: string, sign: string, suffix: string) {
  if (sign === '+' || suffix === 'CR') return true;
  if (sign === '-' || sign === '−' || suffix === 'DR') return false;
  return /\b(received|credit(?:ed)?|cashback|refund|salary|allowance|payment\s+received|transfer\s+in|duitnow\s+received)\b/i.test(line);
}
function parseTransactions(lines: string[]): OcrDraft[] {
  const drafts: OcrDraft[] = [];
  for (let index = 0; index < lines.length && drafts.length < 100; index++) {
    const line = lines[index];
    if (balanceLine.test(line) || receiptExclude.test(line) || /\btotal\b/i.test(line)) continue;
    const amounts = amountMatches(line);
    if (!amounts.length) continue;
    const amount = amounts.at(-1)!;
    const contextStart = Math.max(0, index - 3);
    const context = lines.slice(contextStart, index + 1).join(' ');
    const dateLine = lines.slice(contextStart, index + 1).reverse().find(item => extractDate(item, '') !== '') ?? '';
    const priorText = lines.slice(Math.max(0, index - 2), index).filter(item => !amountMatches(item).length && !/^\d{1,2}:\d{2}/.test(item)).join(' ');
    const title = cleanTitle(`${priorText} ${line}`, 'Bank transaction');
    const type = isIncome(context, amount.sign, amount.suffix) ? 'income' : 'expense';
    drafts.push({ sourceLine: line, type, amountCents: amount.cents, title, category: categoryFor(title, type), role: roleFor(title), date: extractDate(dateLine) });
  }
  return drafts;
}

export function parseOcrText(text: string, mode: OcrMode = 'auto'): OcrParseResult {
  const lines = linesOf(text);
  const documentType: OcrDocumentType = mode === 'auto' ? (looksLikeReceipt(lines) ? 'receipt' : 'transactions') : mode;
  return { documentType, drafts: documentType === 'receipt' ? parseReceipt(lines) : parseTransactions(lines) };
}
