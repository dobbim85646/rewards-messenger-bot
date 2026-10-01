import dotenv from 'dotenv';
dotenv.config({ override: true });

function getCleanApiKey(): string {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key || key === 'MY_GEMINI_API_KEY' || key.length < 20) {
    return '';
  }
  return key;
}

function envInt(name: string, defaultValue: number): number {
  const val = process.env[name];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const val = process.env[name];
  if (val === undefined || val === null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(val.trim().toLowerCase());
}

export function resolveModelName(val?: string, defaultModel = 'gemini-3.1-flash-lite'): string {
  if (!val) return defaultModel;
  const trimmed = val.trim();
  const lower = trimmed.toLowerCase();

  // Smart alias mapping for user-entered deprecated names
  if (lower.includes('1.5-flash') || lower.includes('2.0-flash')) {
    return 'gemini-3.1-flash-lite';
  }
  if (lower.includes('1.5-pro') || lower.includes('2.0-pro') || lower === 'gemini-pro') {
    return 'gemini-3.8-flash';
  }
  if (lower.includes('2.0')) {
    return 'gemini-3.1-flash-lite';
  }

  return trimmed;
}

export const CONFIG = {
  // Server
  port: envInt('PORT', 3000),
  host: '0.0.0.0',

  // Meta Facebook Messenger
  verifyToken: process.env.VERIFY_TOKEN || '',
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || '',
  appSecret: process.env.APP_SECRET || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  graphApiVersion: process.env.GRAPH_API_VERSION || 'v21.0',

  // Gemini API
  geminiApiKey: getCleanApiKey(),
  fastModel: resolveModelName(process.env.GEMINI_FAST_MODEL || process.env.GEMINI_MODEL, 'gemini-3.1-flash-lite'),
  strongModel: resolveModelName(process.env.GEMINI_STRONG_MODEL, 'gemini-3.8-flash'),
  enableAutoFallback: envBool('ENABLE_AUTO_FALLBACK', true),
  fallbackModels: (process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash,gemini-3.5-flash-lite,gemini-flash-latest')
    .split(',')
    .map(m => resolveModelName(m, ''))
    .filter(Boolean),

  thinkingLevel: (process.env.GEMINI_THINKING_LEVEL || 'low').toLowerCase(),
  strongThinkingLevel: (process.env.GEMINI_STRONG_THINKING_LEVEL || 'medium').toLowerCase(),
  geminiTimeoutMs: Math.max(8000, envInt('GEMINI_TIMEOUT_MS', 20000)),
  geminiMediaTimeoutMs: Math.max(8000, envInt('GEMINI_MEDIA_TIMEOUT_MS', 30000)),
  geminiMaxOutputTokens: Math.max(512, envInt('GEMINI_MAX_OUTPUT_TOKENS', 2048)),
  geminiStrongMaxOutputTokens: Math.max(512, envInt('GEMINI_STRONG_MAX_OUTPUT_TOKENS', 3072)),
  geminiMaxRetries: Math.max(0, Math.min(envInt('GEMINI_MAX_RETRIES', 1), 2)),

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // Quotas (generous defaults for smooth chatting)
  dailyUserLimit: envInt('DAILY_USER_LIMIT', 500),
  dailyMediaLimit: envInt('DAILY_MEDIA_LIMIT', 50),
  dailyStrongLimit: envInt('DAILY_STRONG_LIMIT', 50),

  // Search
  enableSearch: envBool('ENABLE_SEARCH', false),
  searchMode: (process.env.SEARCH_MODE || 'auto').trim().toLowerCase(),
  searchKeywords: (
    process.env.SEARCH_KEYWORDS ||
    'latest,today,news,price,prices,weather,score,results,official,update,updates'
  )
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean),

  // Limits
  maxContextMessages: Math.max(4, envInt('MAX_CONTEXT_MESSAGES', 12)),
  maxStoredMessages: Math.max(12, envInt('MAX_STORED_MESSAGES', 30)),
  enableSummary: envBool('ENABLE_SUMMARY', false),
  keepAfterSummary: Math.max(4, envInt('KEEP_AFTER_SUMMARY', 14)),
  hardCapMessages: Math.max(30, envInt('HARD_CAP_MESSAGES', 60)),
  maxMessageLength: envInt('MAX_MESSAGE_LENGTH', 4000),
  maxReplyLength: envInt('MAX_REPLY_LENGTH', 5000),
  messengerChunk: 1900,
  maxMediaBytes: envInt('MAX_MEDIA_BYTES', 8 * 1024 * 1024),
  rateLimitMax: envInt('RATE_LIMIT_MAX', 30),
  rateLimitWindow: envInt('RATE_LIMIT_WINDOW', 60),
  retentionDays: envInt('RETENTION_DAYS', 90),
  showStatusMessages: envBool('SHOW_STATUS_MESSAGES', true),
  fetchMetaProfile: envBool('FETCH_META_PROFILE', true),
  profileRefreshHours: Math.max(1, envInt('PROFILE_REFRESH_HOURS', 24)),
};

export const GRAPH_BASE = `https://graph.facebook.com/${CONFIG.graphApiVersion}`;
export const MESSAGES_URL = `${GRAPH_BASE}/me/messages`;
export const PROFILE_URL = `${GRAPH_BASE}/me/messenger_profile`;

export function updateRuntimeConfig(updates: Partial<typeof CONFIG>) {
  if (updates.fastModel) {
    updates.fastModel = resolveModelName(updates.fastModel);
  }
  if (updates.strongModel) {
    updates.strongModel = resolveModelName(updates.strongModel);
  }
  if (updates.fallbackModels && Array.isArray(updates.fallbackModels)) {
    updates.fallbackModels = updates.fallbackModels.map(m => resolveModelName(m));
  }
  Object.assign(CONFIG, updates);
  console.log('[CONFIG] Runtime config updated:', {
    fastModel: CONFIG.fastModel,
    strongModel: CONFIG.strongModel,
    enableAutoFallback: CONFIG.enableAutoFallback,
    fallbackModels: CONFIG.fallbackModels,
  });
  return CONFIG;
}
