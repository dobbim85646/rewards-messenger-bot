import { CONFIG } from './config.js';

const AR_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u0640]/g;

export function normalize(text: string): string {
  if (!text) return '';
  let res = text.toLowerCase().trim();
  res = res.replace(AR_MARKS, '');

  const replacements: [string, string][] = [
    ['أ', 'ا'],
    ['إ', 'ا'],
    ['آ', 'ا'],
    ['ى', 'ي'],
    ['ة', 'ه'],
  ];

  for (const [src, dst] of replacements) {
    res = res.replaceAll(src, dst);
  }

  res = res.replace(/[^\w\s\u0600-\u06FF]/g, ' ');
  return res.replace(/\s+/g, ' ').trim();
}

export function cleanForMessenger(text: string): string {
  if (!text) return '';
  let res = text;
  // Remove markdown code blocks
  res = res.replace(/```[a-zA-Z0-9_+-]*\n?/g, '');
  // Simplify bold
  res = res.replace(/\*\*(.+?)\*\*/gs, '$1');
  // Remove markdown headers
  res = res.replace(/^(\s{0,3})#{1,6}\s*/gm, '');
  // Format bullet points
  res = res.replace(/^\s*[\*\-]\s+/gm, '• ');
  // Clean redundant newlines
  res = res.replace(/\n{3,}/g, '\n\n');
  return res.trim();
}

export function splitText(text: string, limit = CONFIG.messengerChunk): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > limit) {
    let cut = -1;
    for (const sep of ['\n\n', '\n', '. ', ' ']) {
      const idx = remaining.lastIndexOf(sep, limit);
      if (idx >= limit * 0.4) {
        cut = sep === '. ' ? idx + 1 : idx;
        break;
      }
    }

    if (cut <= 0) {
      cut = limit;
    }

    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

const SEARCH_PHRASES = [
  'اخر خبر',
  'اخر الاخبار',
  'اخر تحديث',
  'احدث خبر',
  'احدث الاخبار',
  'سعر اليوم',
  'اسعار اليوم',
  'الطقس اليوم',
  'نتائج اليوم',
  'مباراة اليوم',
  'what is the latest',
  'latest news',
  'current price',
  'today weather',
  'current score',
];

const SEARCH_WORDS = new Set([
  'اليوم',
  'حاليا',
  'الان',
  'احدث',
  'خبر',
  'اخبار',
  'سعر',
  'اسعار',
  'طقس',
  'نتيجة',
  'نتائج',
  'مباراة',
  'مباريات',
  'latest',
  'today',
  'news',
  'price',
  'prices',
  'weather',
  'score',
  'results',
  'official',
  'update',
  'updates',
]);

export function shouldUseSearch(text: string): boolean {
  if (!CONFIG.enableSearch) return false;
  if (CONFIG.searchMode === 'never') return false;
  if (CONFIG.searchMode === 'always') return true;

  const normalized = normalize(text || '');
  if (!normalized) return false;

  for (const phrase of SEARCH_PHRASES) {
    if (normalized.includes(phrase)) return true;
  }

  const words = new Set(normalized.split(' '));
  for (const word of words) {
    if (SEARCH_WORDS.has(word)) return true;
  }

  for (const kw of CONFIG.searchKeywords) {
    if (words.has(normalize(kw))) return true;
  }

  return false;
}

const HARD_PHRASES = [
  'اشرح بالتفصيل',
  'حل المسألة',
  'حل هذا التمرين',
  'حل التمرين',
  'حل المشكلة',
  'قارن بين',
  'قارن لي بين',
  'حلل بالتفصيل',
  'تحليل مفصل',
  'كيف ابني',
  'كيف انشئ',
  'اكتب لي كود',
  'اكتب الكود',
  'راجع الكود',
  'صحح الكود',
  'debug this',
  'write code',
  'analyze in detail',
  'compare between',
];

const HARD_WORDS = new Set([
  'برمجة',
  'برمج',
  'كود',
  'اكواد',
  'code',
  'coding',
  'debug',
  'debugging',
  'تحليل',
  'حل',
  'مسألة',
  'تمرين',
  'خوارزمية',
  'algorithm',
  'architecture',
  'معمارية',
]);

export function isHardRequest(text: string): boolean {
  const normalized = normalize(text || '');
  if (!normalized) return false;

  for (const phrase of HARD_PHRASES) {
    if (normalized.includes(phrase)) return true;
  }

  const words = new Set(normalized.split(' '));
  for (const word of words) {
    if (HARD_WORDS.has(word)) return true;
  }

  if (normalized.length >= 1200) return true;

  let complexityCues = 0;
  for (const word of ['لماذا', 'كيف', 'اشرح', 'حل', 'قارن', 'تحليل', 'سبب', 'خطا', 'مشكله']) {
    if (words.has(word)) complexityCues++;
  }

  return complexityCues >= 2;
}

export function sanitizeContextValue(value: string | undefined | null, limit: number): string {
  if (!value) return '';
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}
