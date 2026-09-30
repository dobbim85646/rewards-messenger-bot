import { CONFIG } from './config.js';

export interface UserRecord {
  sender_id: string;
  display_name: string;
  created_at: Date;
  updated_at: Date;
  summary: string;
}

export interface MessageRecord {
  id: number;
  sender_id: string;
  role: 'user' | 'model';
  content: string;
  created_at: Date;
}

export interface DailyUsageRecord {
  sender_id: string;
  usage_date: string;
  request_count: number;
  media_count: number;
  strong_count: number;
}

export interface ModelUsageRecord {
  usage_date: string;
  model: string;
  requests: number;
  failures: number;
  total_latency_ms: number;
}

export interface AppStatRecord {
  stat_date: string;
  received_events: number;
  ai_requests: number;
  ai_errors: number;
  sent_messages: number;
  media_requests: number;
}

class BotStore {
  private users = new Map<string, UserRecord>();
  private messages = new Map<string, MessageRecord[]>();
  private processedEvents = new Set<string>();
  private dailyUsage = new Map<string, DailyUsageRecord>();
  private modelUsage = new Map<string, ModelUsageRecord>();
  private appStats = new Map<string, AppStatRecord>();
  private messageCounter = 1;

  private getTodayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  ensureUser(senderId: string): UserRecord {
    const existing = this.users.get(senderId);
    const now = new Date();
    if (existing) {
      existing.updated_at = now;
      return existing;
    }
    const newUser: UserRecord = {
      sender_id: senderId,
      display_name: '',
      created_at: now,
      updated_at: now,
      summary: '',
    };
    this.users.set(senderId, newUser);
    return newUser;
  }

  getUser(senderId: string): UserRecord | undefined {
    return this.users.get(senderId);
  }

  updateUserName(senderId: string, displayName: string): void {
    const user = this.ensureUser(senderId);
    user.display_name = displayName;
    user.updated_at = new Date();
  }

  appendUserFacts(senderId: string, facts: string[]): void {
    if (!facts || facts.length === 0) return;
    const user = this.ensureUser(senderId);
    const existing = user.summary ? user.summary.split(' • ').map(s => s.trim()) : [];
    for (const f of facts) {
      if (!existing.includes(f)) {
        existing.push(f);
      }
    }
    user.summary = existing.slice(-8).join(' • ');
    user.updated_at = new Date();
  }

  saveMessage(senderId: string, role: 'user' | 'model', content: string): void {
    if (!content) return;
    this.ensureUser(senderId);
    let list = this.messages.get(senderId);
    if (!list) {
      list = [];
      this.messages.set(senderId, list);
    }
    list.push({
      id: this.messageCounter++,
      sender_id: senderId,
      role,
      content: content.slice(0, 8000),
      created_at: new Date(),
    });
  }

  getHistory(senderId: string, limit = CONFIG.maxContextMessages): { role: string; content: string }[] {
    const list = this.messages.get(senderId) || [];
    const sliced = list.slice(-limit);
    return sliced.map(m => ({ role: m.role, content: m.content }));
  }

  deleteUserMemory(senderId: string): void {
    this.messages.set(senderId, []);
    const user = this.users.get(senderId);
    if (user) {
      user.summary = '';
      user.updated_at = new Date();
    }
  }

  claimEvent(eventId: string): boolean {
    if (this.processedEvents.has(eventId)) {
      return false;
    }
    this.processedEvents.add(eventId);
    return true;
  }

  hasProcessedEvent(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  private getDailyRecord(senderId: string, today: string): DailyUsageRecord {
    const key = `${senderId}:${today}`;
    let rec = this.dailyUsage.get(key);
    if (!rec) {
      rec = {
        sender_id: senderId,
        usage_date: today,
        request_count: 0,
        media_count: 0,
        strong_count: 0,
      };
      this.dailyUsage.set(key, rec);
    }
    return rec;
  }

  consumeDailyRequest(senderId: string): boolean {
    if (CONFIG.dailyUserLimit <= 0) return true;
    const today = this.getTodayStr();
    const rec = this.getDailyRecord(senderId, today);
    if (rec.request_count >= CONFIG.dailyUserLimit) {
      return false;
    }
    rec.request_count += 1;
    return true;
  }

  consumeDailyMedia(senderId: string): boolean {
    if (CONFIG.dailyMediaLimit <= 0) return true;
    const today = this.getTodayStr();
    const rec = this.getDailyRecord(senderId, today);
    if (rec.media_count >= CONFIG.dailyMediaLimit) {
      return false;
    }
    rec.media_count += 1;
    return true;
  }

  consumeDailyStrong(senderId: string): boolean {
    if (CONFIG.dailyStrongLimit <= 0) return true;
    const today = this.getTodayStr();
    const rec = this.getDailyRecord(senderId, today);
    if (rec.strong_count >= CONFIG.dailyStrongLimit) {
      return false;
    }
    rec.strong_count += 1;
    return true;
  }

  reserveModel(senderId: string, strongRequested: boolean): string {
    if (!strongRequested || CONFIG.strongModel === CONFIG.fastModel) {
      return CONFIG.fastModel;
    }
    if (this.consumeDailyStrong(senderId)) {
      return CONFIG.strongModel;
    }
    return CONFIG.fastModel;
  }

  recordModelUsage(model: string, latencyMs: number, failed = false): void {
    const today = this.getTodayStr();
    const key = `${today}:${model}`;
    let rec = this.modelUsage.get(key);
    if (!rec) {
      rec = {
        usage_date: today,
        model,
        requests: 0,
        failures: 0,
        total_latency_ms: 0,
      };
      this.modelUsage.set(key, rec);
    }
    rec.requests += 1;
    if (failed) rec.failures += 1;
    rec.total_latency_ms += Math.round(latencyMs);
  }

  incrementStat(field: keyof Omit<AppStatRecord, 'stat_date'>): void {
    const today = this.getTodayStr();
    let rec = this.appStats.get(today);
    if (!rec) {
      rec = {
        stat_date: today,
        received_events: 0,
        ai_requests: 0,
        ai_errors: 0,
        sent_messages: 0,
        media_requests: 0,
      };
      this.appStats.set(today, rec);
    }
    rec[field] += 1;
  }

  compactMemory(senderId: string): void {
    const list = this.messages.get(senderId);
    if (!list) return;

    if (list.length > CONFIG.hardCapMessages) {
      this.messages.set(senderId, list.slice(-CONFIG.maxContextMessages));
    } else if (list.length > CONFIG.maxStoredMessages) {
      this.messages.set(senderId, list.slice(-CONFIG.maxContextMessages));
    }
  }

  getAdminStats() {
    const stats = Array.from(this.appStats.values()).sort((a, b) => b.stat_date.localeCompare(a.stat_date)).slice(0, 14);
    const models = Array.from(this.modelUsage.values()).sort((a, b) => b.usage_date.localeCompare(a.usage_date)).slice(0, 50);

    const usageByDate = new Map<string, { usage_date: string; users: number; requests: number; media: number; strong: number }>();
    for (const item of this.dailyUsage.values()) {
      let entry = usageByDate.get(item.usage_date);
      if (!entry) {
        entry = { usage_date: item.usage_date, users: 0, requests: 0, media: 0, strong: 0 };
        usageByDate.set(item.usage_date, entry);
      }
      entry.users += 1;
      entry.requests += item.request_count;
      entry.media += item.media_count;
      entry.strong += item.strong_count;
    }

    const daily_usage = Array.from(usageByDate.values()).sort((a, b) => b.usage_date.localeCompare(a.usage_date)).slice(0, 14);

    return {
      app_stats: stats,
      model_usage: models,
      daily_usage,
      models: {
        fast: CONFIG.fastModel,
        strong: CONFIG.strongModel,
        fallbacks: CONFIG.fallbackModels,
      },
    };
  }
}

export const store = new BotStore();
