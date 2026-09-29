import crypto from 'node:crypto';
import { CONFIG, MESSAGES_URL } from './config.js';
import { store } from './store.js';
import {
  cleanForMessenger,
  isHardRequest,
  normalize,
  shouldUseSearch,
  splitText,
} from './text-utils.js';
import {
  buildSystemInstruction,
  callGemini,
  ContentPart,
  GeminiMessage,
  getGeminiClient,
} from './gemini.js';

export const WELCOME_TEXT = `أهلًا بيك في DZ Connect AI 👋🇩🇿

أنا مساعدك الذكي، نفهمك بالعربية والدارجة الجزائرية.
تقدر تسولني على أي حاجة، ترسل صورة، وحتى رسالة صوتية 🎙️

اكتب «مساعدة» باش تشوف الأوامر.`;

export const HELP_TEXT = `الأوامر المتاحة:

• مساعدة — عرض هذه الرسالة
• ابدأ من جديد / احذف ذاكرتي — مسح المحادثة والذاكرة
• الخصوصية — كيف نتعامل مع بياناتك

💡 جرّب إرسال صورة أو رسالة صوتية، أو اسألني عن أي موضوع.`;

export const PRIVACY_TEXT = `🔒 الخصوصية:

• نحتفظ برسائل محدودة من محادثتك للحفاظ على السياق.
• لا نطلب كلمات المرور ولا رموز OTP.
• يمكنك مسح ذاكرتك في أي وقت.
• تُحذف البيانات تلقائيًا بعد ${CONFIG.retentionDays} يومًا من آخر نشاط.`;

export const RESET_TEXT = `🗑️ تم حذف ذاكرة المحادثة فقط.

يمكننا البدء من جديد.`;

export const RATE_LIMIT_TEXT = `⏳ راك تبعث بسرعة كبيرة، استنى شوية وعاود.`;

export const DAILY_LIMIT_TEXT = `📊 وصلت للحد اليومي المجاني من الرسائل.
عاود غدوة إن شاء الله.`;

export const MEDIA_LIMIT_TEXT = `🖼️ وصلت للحد اليومي المجاني للصور والرسائل الصوتية.
تقدر تواصل بالرسائل النصية.`;

export const UNSUPPORTED_TEXT = `حاليًا نفهم النصوص والصور والرسائل الصوتية فقط 🙏`;

export const AI_UNAVAILABLE_TEXT = `⚠️ الذكاء الاصطناعي غير متاح حاليًا (مفتاح GEMINI_API_KEY غير متوفر). حاول لاحقًا.`;

export const AI_ERROR_TEXT = `حدث خطأ مؤقت أثناء معالجة رسالتك. حاول مرة أخرى بعد قليل.`;

export const AI_EMPTY_TEXT = `عذرًا، لم أتمكن من إنشاء رد هذه المرة. أعد صياغة سؤالك من فضلك.`;

export const QUICK_REPLIES = [
  { content_type: 'text', title: '❓ مساعدة', payload: 'HELP' },
  { content_type: 'text', title: '🔒 الخصوصية', payload: 'PRIVACY' },
  { content_type: 'text', title: '🗑️ مسح الذاكرة', payload: 'RESET' },
];

const COMMAND_ALIASES: Record<string, string[]> = {
  RESET: [
    '/reset',
    'reset',
    'delete memory',
    'clear memory',
    'احذف ذاكرتي',
    'احذف الذاكره',
    'مسح الذاكره',
    'امسح ذاكرتي',
    'امسح الذاكره',
    'ابدا من جديد',
    'ابدأ من جديد',
  ],
  HELP: ['/help', 'help', 'مساعده', 'المساعده', 'الاوامر', 'اوامر'],
  PRIVACY: ['/privacy', 'privacy', 'الخصوصيه', 'سياسه الخصوصيه'],
  START: ['/start', 'start', 'ابدا', 'ابدأ'],
};

const COMMAND_LOOKUP = new Map<string, string>();
for (const [cmd, aliases] of Object.entries(COMMAND_ALIASES)) {
  for (const alias of aliases) {
    COMMAND_LOOKUP.set(normalize(alias), cmd);
  }
}

// In-memory rate limiting
const rateHits = new Map<string, number[]>();

export function isRateLimited(senderId: string): boolean {
  const now = Date.now();
  let hits = rateHits.get(senderId);
  if (!hits) {
    hits = [];
    rateHits.set(senderId, hits);
  }

  // Filter window
  const cutoff = now - CONFIG.rateLimitWindow * 1000;
  hits = hits.filter(t => t > cutoff);
  rateHits.set(senderId, hits);

  if (hits.length >= CONFIG.rateLimitMax) {
    return true;
  }
  hits.push(now);
  return false;
}

export function verifySignature(rawBody: Buffer | string, signatureHeader?: string): boolean {
  if (!CONFIG.appSecret) return true; // if secret not set, pass in dev
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const received = signatureHeader.slice(7).trim();
  const expected = crypto
    .createHmac('sha256', CONFIG.appSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  } catch {
    return false;
  }
}

// Send to Facebook Graph API
export async function graphPost(url: string, payload: any): Promise<boolean> {
  if (!CONFIG.pageAccessToken) {
    console.log('[Graph API Simulation] PAGE_ACCESS_TOKEN not set, skipping outbound call');
    return true;
  }

  try {
    const fullUrl = `${url}?access_token=${encodeURIComponent(CONFIG.pageAccessToken)}`;
    const res = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DZ-Connect-AI/1.0',
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return true;
    }
    const errText = await res.text();
    if (errText.includes('1893063')) {
      console.warn(`[Graph API] Recipient ${payload?.recipient?.id || ''} cannot receive messages: user has blocked the bot or the Meta app is in Development Mode without Tester role.`);
    } else {
      console.error(`[Graph API Error] Status ${res.status}:`, errText.slice(0, 300));
    }
    return false;
  } catch (err) {
    console.error('[Graph API Request Error]', err);
    return false;
  }
}

export async function sendAction(recipientId: string, action: string): Promise<boolean> {
  return graphPost(MESSAGES_URL, {
    recipient: { id: recipientId },
    sender_action: action,
  });
}

export async function sendMessage(
  recipientId: string,
  text: string,
  quickReplies?: Array<{ content_type: string; title: string; payload: string }>
): Promise<boolean> {
  if (!text) return false;

  const chunks = splitText(text);
  let allOk = true;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const message: any = { text: chunk };

    if (quickReplies && i === chunks.length - 1) {
      message.quick_replies = quickReplies;
    }

    const ok = await graphPost(MESSAGES_URL, {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message,
    });

    if (ok) {
      store.incrementStat('sent_messages');
    } else {
      allOk = false;
    }

    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return allOk;
}

export async function runCommand(senderId: string, command: string): Promise<string | null> {
  const upper = (command || '').toUpperCase();

  if (upper === 'RESET') {
    store.deleteUserMemory(senderId);
    await sendMessage(senderId, RESET_TEXT, QUICK_REPLIES.slice(0, 2));
    return RESET_TEXT;
  }

  if (upper === 'HELP') {
    await sendMessage(senderId, HELP_TEXT, QUICK_REPLIES);
    return HELP_TEXT;
  }

  if (upper === 'PRIVACY') {
    await sendMessage(senderId, PRIVACY_TEXT, QUICK_REPLIES.slice(0, 1));
    return PRIVACY_TEXT;
  }

  if (['START', 'GET_STARTED'].includes(upper)) {
    await sendMessage(senderId, WELCOME_TEXT, QUICK_REPLIES);
    return WELCOME_TEXT;
  }

  return null;
}

export interface ProcessResult {
  reply: string;
  quickReplies?: Array<{ content_type: string; title: string; payload: string }>;
  modelUsed?: string;
  searchUsed?: boolean;
  status?: string;
}

// Core processing logic shared by Webhook events and UI Simulator
export async function processUserMessage(
  senderId: string,
  text: string,
  mediaParts: ContentPart[] = [],
  mediaKind?: 'image' | 'audio'
): Promise<ProcessResult> {
  store.ensureUser(senderId);
  store.incrementStat('received_events');

  // 1. Text commands check
  if (text) {
    const recognizedCommand = COMMAND_LOOKUP.get(normalize(text));
    if (recognizedCommand) {
      const commandReply = await runCommand(senderId, recognizedCommand);
      if (commandReply) {
        return {
          reply: commandReply,
          quickReplies: recognizedCommand === 'RESET' ? QUICK_REPLIES.slice(0, 2) : QUICK_REPLIES,
        };
      }
    }
  }

  // 2. Media processing & quota
  if (mediaParts.length > 0) {
    store.incrementStat('media_requests');
    if (!store.consumeDailyMedia(senderId)) {
      await sendMessage(senderId, MEDIA_LIMIT_TEXT);
      return { reply: MEDIA_LIMIT_TEXT };
    }
  }

  // 3. Empty input check
  if (!text && mediaParts.length === 0) {
    if (mediaKind === undefined && text === '') {
      // No text and no attachments (or unsupported attachment)
      await sendMessage(senderId, UNSUPPORTED_TEXT);
      return { reply: UNSUPPORTED_TEXT };
    }
    return { reply: '' };
  }

  // 4. Rate limit check
  if (isRateLimited(senderId)) {
    await sendMessage(senderId, RATE_LIMIT_TEXT);
    return { reply: RATE_LIMIT_TEXT };
  }

  // 5. Daily request limit
  if (!store.consumeDailyRequest(senderId)) {
    await sendMessage(senderId, DAILY_LIMIT_TEXT);
    return { reply: DAILY_LIMIT_TEXT };
  }

  // Typing indicator on Messenger
  await sendAction(senderId, 'typing_on');

  // 6. Build Gemini contents
  const history = store.getHistory(senderId);
  const geminiContents: GeminiMessage[] = history.map(h => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.content }],
  }));

  const userParts: ContentPart[] = [];
  if (text) {
    userParts.push({ text });
  }

  if (mediaParts.length > 0) {
    if (mediaKind === 'audio') {
      userParts.unshift({
        text: 'استمع إلى الرسالة الصوتية وافهم محتواها ثم أجب عن طلب المستخدم.',
      });
    } else if (mediaKind === 'image') {
      userParts.unshift({
        text: 'حلل الصورة بدقة وأجب عن سؤال المستخدم.',
      });
    }
    userParts.push(...mediaParts);
  }

  geminiContents.push({
    role: 'user',
    parts: userParts,
  });

  // 7. Search & Model routing
  let useSearch = Boolean(text) && shouldUseSearch(text);
  if (mediaKind === 'audio') {
    useSearch = false;
  }

  const strongRequested = isHardRequest(text);
  const preferredModel = store.reserveModel(senderId, strongRequested);

  const thinkingLevel =
    preferredModel === CONFIG.strongModel
      ? CONFIG.strongThinkingLevel
      : CONFIG.thinkingLevel;

  const maxTokens =
    preferredModel === CONFIG.strongModel
      ? CONFIG.geminiStrongMaxOutputTokens
      : CONFIG.geminiMaxOutputTokens;

  const user = store.getUser(senderId);
  const systemInstruction = buildSystemInstruction(
    user?.summary || '',
    user?.display_name || '',
    thinkingLevel
  );

  store.incrementStat('ai_requests');

  let rawReply = await callGemini(
    geminiContents,
    systemInstruction,
    useSearch,
    preferredModel,
    thinkingLevel,
    maxTokens
  );

  if (!rawReply) {
    store.incrementStat('ai_errors');
    rawReply = getGeminiClient() ? AI_ERROR_TEXT : AI_UNAVAILABLE_TEXT;
  }

  let finalReply = cleanForMessenger(rawReply);
  if (finalReply.length > CONFIG.maxReplyLength) {
    finalReply = finalReply.slice(0, CONFIG.maxReplyLength).trimEnd() + '…';
  }

  // 8. Save to memory
  const savedUserText = text || (mediaKind ? `[أرسل ${mediaKind === 'image' ? 'صورة' : 'رسالة صوتية'}]` : '[رسالة]');
  store.saveMessage(senderId, 'user', savedUserText);
  store.saveMessage(senderId, 'model', finalReply);

  // 9. Send out message
  await sendMessage(senderId, finalReply);
  await sendAction(senderId, 'typing_off');

  // Compact memory
  store.compactMemory(senderId);

  return {
    reply: finalReply,
    quickReplies: QUICK_REPLIES,
    modelUsed: preferredModel,
    searchUsed: useSearch,
  };
}

// Handle an incoming Facebook webhook event
export async function handleWebhookEvent(event: any): Promise<boolean> {
  const senderId = event?.sender?.id;
  if (!senderId) return false;

  // 1. Explicitly ignore delivery receipts, read receipts, reactions, echoes, etc.
  if (
    event.delivery ||
    event.read ||
    event.reaction ||
    event.account_linking ||
    event.optin ||
    event.message?.is_echo
  ) {
    return true;
  }

  const message = event.message;
  const postback = event.postback;

  // 2. Ignore if neither a real message nor a postback exists
  if (!message && !postback) {
    return true;
  }

  const eventId =
    message?.mid ||
    postback?.mid ||
    `event:${senderId}:${event.timestamp}`;

  if (store.hasProcessedEvent(eventId)) {
    console.log(`[Webhook] Duplicate event ignored | id=${eventId}`);
    return true;
  }

  // Claim event immediately to block concurrent duplicate webhook retries
  store.claimEvent(eventId);

  // Postback command
  if (postback?.payload) {
    const cmd = postback.payload.toUpperCase();
    await runCommand(senderId, cmd);
    return true;
  }

  // Quick reply
  const quickPayload = message?.quick_reply?.payload;
  if (quickPayload) {
    await runCommand(senderId, quickPayload.toUpperCase());
    return true;
  }

  // Text / Media message
  const text = (message?.text || '').trim().slice(0, CONFIG.maxMessageLength);
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];

  // If no text and no attachments, ignore silently
  if (!text && attachments.length === 0) {
    return true;
  }

  const mediaParts: ContentPart[] = [];
  let mediaKind: 'image' | 'audio' | undefined;

  for (const att of attachments) {
    if (att.type === 'image' && att.payload?.url) {
      mediaKind = 'image';
      try {
        const resp = await fetch(att.payload.url);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const b64 = Buffer.from(buf).toString('base64');
          mediaParts.push({
            inlineData: {
              mimeType: resp.headers.get('content-type') || 'image/jpeg',
              data: b64,
            },
          });
        }
      } catch (e) {
        console.error('[Media download failed]', e);
      }
    } else if (att.type === 'audio' && att.payload?.url) {
      mediaKind = 'audio';
      try {
        const resp = await fetch(att.payload.url);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          const b64 = Buffer.from(buf).toString('base64');
          mediaParts.push({
            inlineData: {
              mimeType: resp.headers.get('content-type') || 'audio/mp4',
              data: b64,
            },
          });
        }
      } catch (e) {
        console.error('[Media download failed]', e);
      }
    }
  }

  await processUserMessage(senderId, text, mediaParts, mediaKind);
  return true;
}
