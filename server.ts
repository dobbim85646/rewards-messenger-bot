import express, { Request, Response } from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, PROFILE_URL } from './src/bot/config.js';
import { store } from './src/bot/store.js';
import {
  graphPost,
  handleWebhookEvent,
  processUserMessage,
  verifySignature,
  WELCOME_TEXT,
  HELP_TEXT,
  PRIVACY_TEXT,
  RESET_TEXT,
} from './src/bot/bot-engine.js';
import { getGeminiClient } from './src/bot/gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Capture raw body for webhook signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// =========================================================
// Facebook Messenger Webhook Routes
// =========================================================

// Verification GET /webhook
app.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string;
  const token = req.query['hub.verify_token'] as string;
  const challenge = req.query['hub.challenge'] as string;

  if (mode === 'subscribe' && token && (token === CONFIG.verifyToken || !CONFIG.verifyToken)) {
    console.log('[Webhook] Verification successful');
    res.status(200).send(challenge);
  } else {
    console.warn('[Webhook] Verification failed: token mismatch');
    res.status(403).send('Verification failed');
  }
});

// Event POST /webhook
app.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const rawBody = (req as any).rawBody || JSON.stringify(req.body);

  if (CONFIG.appSecret && signature) {
    const valid = verifySignature(rawBody, signature);
    if (!valid) {
      console.warn('[Webhook] Signature verification failed. Check APP_SECRET on Render.');
      if (process.env.ENFORCE_SIGNATURE === 'true') {
        return res.status(403).send('Invalid signature');
      }
    }
  }

  const data = req.body;
  if (!data || (data.object !== 'page' && data.object !== 'instagram')) {
    return res.status(200).send('EVENT_RECEIVED');
  }

  // Acknowledge immediately to Facebook
  res.status(200).send('EVENT_RECEIVED');

  // Process asynchronously
  try {
    for (const entry of data.entry || []) {
      const events = [
        ...(Array.isArray(entry.messaging) ? entry.messaging : []),
        ...(Array.isArray(entry.standby) ? entry.standby : []),
      ];

      for (const event of events) {
        handleWebhookEvent(event).catch(err => {
          console.error('[Webhook] Error handling event:', err);
        });
      }
    }
  } catch (err) {
    console.error('[Webhook] Error parsing entry:', err);
  }
});

// Diagnostic endpoint to check Facebook Page Token & App info
app.get('/api/check-facebook', async (_req: Request, res: Response) => {
  if (!CONFIG.pageAccessToken) {
    return res.json({ configured: false, message: 'PAGE_ACCESS_TOKEN is not set' });
  }

  try {
    const token = CONFIG.pageAccessToken.trim();
    // 1. Query basic Page info with fallback
    const meUrl = `https://graph.facebook.com/${CONFIG.graphApiVersion}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const meResp = await fetch(meUrl);
    let meData = await meResp.json();

    // If querying fields failed, try querying bare /me
    if (!meResp.ok) {
      try {
        const bareResp = await fetch(`https://graph.facebook.com/${CONFIG.graphApiVersion}/me?access_token=${encodeURIComponent(token)}`);
        const bareData = await bareResp.json();
        if (bareResp.ok) {
          meData = { ...bareData, note: 'Fetched via bare /me endpoint' };
        }
      } catch {}
    }

    // 2. Query App info to verify which App issued the token
    let appInfo = null;
    try {
      const appResp = await fetch(`https://graph.facebook.com/${CONFIG.graphApiVersion}/app?access_token=${encodeURIComponent(token)}`);
      appInfo = await appResp.json();
    } catch {}

    // 3. Query subscribed apps
    let subscribedApps = null;
    try {
      const subUrl = `https://graph.facebook.com/${CONFIG.graphApiVersion}/me/subscribed_apps?access_token=${encodeURIComponent(token)}`;
      const subResp = await fetch(subUrl);
      subscribedApps = await subResp.json();
    } catch {}

    res.json({
      configured: true,
      token_preview: token.slice(0, 10) + '...' + token.slice(-5),
      token_length: token.length,
      status: meResp.status,
      ok: meResp.ok,
      page: meData,
      app_info: appInfo,
      subscribed_apps: subscribedApps,
    });
  } catch (err: any) {
    res.status(500).json({ configured: true, error: err?.message || 'Check failed' });
  }
});

// Endpoint to automatically subscribe Facebook App to the Page webhooks
app.post('/api/subscribe-page', async (_req: Request, res: Response) => {
  if (!CONFIG.pageAccessToken) {
    return res.status(400).json({ success: false, error: 'PAGE_ACCESS_TOKEN is not set' });
  }

  try {
    const token = CONFIG.pageAccessToken.trim();
    const url = `https://graph.facebook.com/${CONFIG.graphApiVersion}/me/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(token)}`;
    const resp = await fetch(url, { method: 'POST' });
    const data = await resp.json();
    res.json({ status: resp.status, ok: resp.ok, result: data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// =========================================================
// Health Route
// =========================================================

app.get('/health', (_req: Request, res: Response) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY || CONFIG.geminiApiKey);
  const messengerConfigured = Boolean(CONFIG.pageAccessToken);
  const signatureVerification = Boolean(CONFIG.appSecret);

  const healthy = geminiConfigured;

  res.json({
    status: healthy ? 'ok' : 'degraded',
    database: true,
    database_pool: true,
    gemini_configured: geminiConfigured,
    gemini_fast_model: CONFIG.fastModel,
    gemini_strong_model: CONFIG.strongModel,
    thinking_level: CONFIG.thinkingLevel,
    strong_thinking_level: CONFIG.strongThinkingLevel,
    gemini_timeout_ms: CONFIG.geminiTimeoutMs,
    search_mode: CONFIG.searchMode,
    daily_user_limit: CONFIG.dailyUserLimit,
    daily_media_limit: CONFIG.dailyMediaLimit,
    daily_strong_limit: CONFIG.dailyStrongLimit,
    messenger_configured: messengerConfigured,
    signature_verification: signatureVerification,
  });
});

// =========================================================
// Admin Routes
// =========================================================

function checkAdminAuth(req: Request): boolean {
  if (!CONFIG.adminToken) return true; // allowed if no token configured
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice(7).trim() === CONFIG.adminToken;
}

app.get('/admin/stats', (req: Request, res: Response) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(store.getAdminStats());
});

app.post('/admin/setup', async (req: Request, res: Response) => {
  if (!checkAdminAuth(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const payload = {
    get_started: { payload: 'GET_STARTED' },
    greeting: [
      {
        locale: 'default',
        text: 'مرحبًا بك في DZ Connect AI 🇩🇿 — مساعدك الذكي بالعربية والدارجة.',
      },
    ],
    persistent_menu: [
      {
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: [
          { type: 'postback', title: '❓ المساعدة', payload: 'HELP' },
          { type: 'postback', title: '🔒 الخصوصية', payload: 'PRIVACY' },
          { type: 'postback', title: '🗑️ مسح الذاكرة', payload: 'RESET' },
        ],
      },
    ],
  };

  const ok = await graphPost(PROFILE_URL, payload);
  res.status(ok ? 200 : 500).json({ success: ok });
});

// =========================================================
// Internal Simulator API Routes (for in-browser preview)
// =========================================================

app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { senderId = 'web_user', message = '', mediaData, mediaMimeType, mediaKind } = req.body;
    const mediaParts = [];
    if (mediaData && mediaMimeType) {
      mediaParts.push({
        inlineData: {
          mimeType: mediaMimeType,
          data: mediaData,
        },
      });
    }

    const result = await processUserMessage(
      senderId,
      message,
      mediaParts,
      mediaKind as 'image' | 'audio' | undefined
    );

    const history = store.getHistory(senderId);
    res.json({
      ...result,
      history,
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err?.message || 'Chat processing error' });
  }
});

app.get('/api/history/:senderId', (req: Request, res: Response) => {
  const { senderId } = req.params;
  const history = store.getHistory(senderId);
  const user = store.getUser(senderId);
  res.json({
    history,
    user,
  });
});

app.post('/api/reset/:senderId', (req: Request, res: Response) => {
  const { senderId } = req.params;
  store.deleteUserMemory(senderId);
  res.json({ success: true, message: RESET_TEXT });
});

app.get('/api/stats', (_req: Request, res: Response) => {
  res.json(store.getAdminStats());
});

app.post('/api/simulate-webhook', async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const ok = await handleWebhookEvent(event);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// =========================================================
// Frontend Mounting (Vite in Dev, Static in Prod)
// =========================================================

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response, next) => {
      // Return plain text if specifically requested (as original Python route / does)
      if (req.path === '/' && req.headers.accept?.includes('text/plain')) {
        return res.send('DZ Connect AI Messenger Bot is running.');
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const port = CONFIG.port;
  server.listen(port, '0.0.0.0', () => {
    console.log(`🤖 DZ Connect AI Server listening on http://0.0.0.0:${port}`);
    console.log(`📡 Webhook endpoint: http://0.0.0.0:${port}/webhook`);
    console.log(`🩺 Health endpoint: http://0.0.0.0:${port}/health`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
