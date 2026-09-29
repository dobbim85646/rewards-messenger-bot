# DZ Connect AI — Messenger Bot 🇩🇿

Production-ready Algerian Darija and Arabic AI Messenger Bot powered by Google Gemini, migrated to TypeScript & Node.js for Google AI Studio.

## Features
- **Algerian Darija, Arabic & Arabizi Intelligence**: Powered by `gemini-3.8-flash` with Google Search grounding.
- **Fast / Strong Model Dynamic Routing**: Automatically detects complex queries (coding, in-depth analysis, reasoning) and routes to strong model configurations.
- **Full Facebook Messenger Integration**:
  - `GET /webhook`: Verification token challenge response.
  - `POST /webhook`: Inbound message, postback, quick reply, and attachment processing with SHA-256 HMAC signature validation (`X-Hub-Signature-256`).
- **Interactive Web Simulator & Dashboard**:
  - Live chat simulator to test the bot directly in the browser with real Gemini AI.
  - Webhook inspection & simulator console.
  - Health & analytics metrics (`/health`, `/admin/stats`).
- **Daily Usage Quotas & Rate Limiting**: Protection against abuse with daily request limits, media quotas, and sliding window rate limits.
- **Conversation Memory & Compaction**: In-memory database with history tracking and automatic context pruning.

## Environment Variables
Defined in `.env.example`:
- `PORT`: 3000
- `GEMINI_API_KEY`: Google Gemini API key
- `VERIFY_TOKEN`: Facebook Messenger webhook verification token
- `PAGE_ACCESS_TOKEN`: Facebook Page access token for outbound messages
- `APP_SECRET`: Facebook App secret for signature verification
- `ADMIN_TOKEN`: Bearer token for admin endpoints

## Endpoints
- `GET /` — Interactive web application (Messenger simulator, Webhook tester, Analytics)
- `GET /health` — Bot health status JSON
- `GET /webhook` — Meta verification endpoint
- `POST /webhook` — Meta messaging event processor
- `GET /admin/stats` — Admin metrics and model usage data
- `POST /admin/setup` — Persistent menu and greeting configurator
