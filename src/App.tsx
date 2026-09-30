import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Activity,
  Send,
  Trash2,
  HelpCircle,
  Shield,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Search,
  Zap,
  Image as ImageIcon,
  Mic,
  Cpu,
  Globe,
  Settings,
  Terminal,
  ExternalLink,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'model';
  text: string;
  modelUsed?: string;
  searchUsed?: boolean;
  timestamp: string;
  isAnimated?: boolean;
}

interface HealthData {
  status: string;
  database: boolean;
  gemini_configured: boolean;
  gemini_fast_model: string;
  gemini_strong_model: string;
  thinking_level: string;
  daily_user_limit: number;
  daily_media_limit: number;
  daily_strong_limit: number;
  messenger_configured: boolean;
  signature_verification: boolean;
}

// Typing animation component for smooth letter-by-letter rendering
function TypewriterText({
  text,
  isAnimated = false,
  onProgress,
  onComplete,
}: {
  text: string;
  isAnimated?: boolean;
  onProgress?: () => void;
  onComplete?: () => void;
}) {
  const [displayText, setDisplayText] = useState(isAnimated ? '' : text);
  const [isTyping, setIsTyping] = useState(isAnimated);

  useEffect(() => {
    if (!isAnimated) {
      setDisplayText(text);
      setIsTyping(false);
      return;
    }

    let i = 0;
    setIsTyping(true);
    setDisplayText('');

    // Dynamic speed: longer text types faster so user does not wait excessively
    const step = text.length > 600 ? 4 : text.length > 250 ? 2 : 1;
    const intervalTime = text.length > 600 ? 8 : text.length > 250 ? 12 : 16;

    const timer = setInterval(() => {
      i += step;
      if (i >= text.length) {
        setDisplayText(text);
        setIsTyping(false);
        clearInterval(timer);
        onProgress?.();
        onComplete?.();
      } else {
        setDisplayText(text.slice(0, i));
        if (i % (step * 3) === 0) {
          onProgress?.();
        }
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [text, isAnimated]);

  const handleInstantReveal = () => {
    if (isTyping) {
      setDisplayText(text);
      setIsTyping(false);
      onProgress?.();
      onComplete?.();
    }
  };

  return (
    <span
      className={isTyping ? 'cursor-pointer select-none' : ''}
      onClick={handleInstantReveal}
      title={isTyping ? 'انقر لعرض كامل الرسالة فوراً' : undefined}
    >
      {displayText}
      {isTyping && (
        <span className="inline-block w-1.5 h-3.5 bg-blue-400 rounded-xs mx-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'webhook' | 'stats' | 'setup'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'model',
      text: 'أهلًا بيك في DZ Connect AI 👋🇩🇿\n\nأنا مساعدك الذكي، نفهمك بالعربية والدارجة الجزائرية.\nتقدر تسولني على أي حاجة، ترسل صورة، وحتى رسالة صوتية 🎙️\n\nاكتب «مساعدة» باش تشوف الأوامر.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [selectedImage, setSelectedImage] = useState<{ b64: string; mime: string } | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Webhook Test State
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('my_verify_token');
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [webhookPayload, setWebhookPayload] = useState<string>(
    JSON.stringify(
      {
        object: 'page',
        entry: [
          {
            id: '123456789',
            time: Date.now(),
            messaging: [
              {
                sender: { id: 'fb_user_demo_101' },
                recipient: { id: 'page_id_101' },
                timestamp: Date.now(),
                message: {
                  mid: 'mid.' + Date.now(),
                  text: 'واش راك خونا؟ كاش جديد اليوم؟',
                },
              },
            ],
          },
        ],
      },
      null,
      2
    )
  );
  const [webhookResult, setWebhookResult] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchHealth();
    fetchStats();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!text && !selectedImage) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: text || (selectedImage ? '[صورة مرفقة]' : ''),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    const curImg = selectedImage;
    setSelectedImage(null);
    setImagePreview(null);
    setIsLoading(true);

    // Contextual status text
    setLoadingStatus('جاري التفكير وفهم رسالتك...');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: 'demo_web_user',
          message: text,
          mediaData: curImg?.b64,
          mediaMimeType: curImg?.mime,
          mediaKind: curImg ? 'image' : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.reply) {
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'model',
            text: data.reply,
            modelUsed: data.modelUsed,
            searchUsed: data.searchUsed,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isAnimated: true,
          },
        ]);
        fetchStats();
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'model',
            text: data.error || 'حدث خطأ أثناء معالجة رسالتك.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isAnimated: true,
          },
        ]);
      }
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'model',
          text: 'تعذر الاتصال بالخادم. تأكد من تشغيل البوت ومفتاح Gemini.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isAnimated: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleResetMemory = async () => {
    try {
      await fetch('/api/reset/demo_web_user', { method: 'POST' });
      setMessages([
        {
          id: Date.now().toString(),
          sender: 'model',
          text: '🗑️ تم حذف ذاكرة المحادثة فقط.\n\nيمكننا البدء من جديد.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.split(',')[1];
      setSelectedImage({ b64, mime: file.type });
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const testWebhookGet = async () => {
    try {
      const challenge = 'challenge_' + Math.random().toString(36).substring(7);
      const res = await fetch(`/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(webhookVerifyToken)}&hub.challenge=${challenge}`);
      const text = await res.text();
      setVerifyResult({
        status: res.status,
        ok: res.ok,
        challengeReturned: text === challenge,
        response: text,
      });
    } catch (err: any) {
      setVerifyResult({ status: 'Error', ok: false, error: err.message });
    }
  };

  const testWebhookPost = async () => {
    try {
      let parsed;
      try {
        parsed = JSON.parse(webhookPayload);
      } catch {
        alert('Invalid JSON in payload');
        return;
      }
      const res = await fetch('/api/simulate-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setWebhookResult({
        status: res.status,
        ok: res.ok,
        data,
      });
      fetchStats();
    } catch (err: any) {
      setWebhookResult({ status: 'Error', ok: false, error: err.message });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 py-3 shadow-md">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-600 via-teal-500 to-sky-500 flex items-center justify-center text-xl shadow-lg ring-2 ring-emerald-500/30">
              🇩🇿
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg text-white tracking-wide">DZ Connect AI</h1>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Messenger Bot
                </span>
              </div>
              <p className="text-xs text-slate-400">
                مساعد ذكي بالدارجة والعربية مع Gemini 3.8 Flash & Google Search
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'chat'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              المحاكي
            </button>
            <button
              onClick={() => setActiveTab('webhook')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'webhook'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              اختبار الويب هوك
            </button>
            <button
              onClick={() => {
                setActiveTab('stats');
                fetchStats();
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              الإحصائيات
            </button>
            <button
              onClick={() => setActiveTab('setup')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'setup'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              إعداد Meta
            </button>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 flex flex-col">
        {/* TAB 1: Messenger Simulator */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            {/* Messenger Chat Header */}
            <div className="bg-slate-850 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shadow">
                    DZ
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                </div>
                <div>
                  <h2 className="font-semibold text-sm text-slate-100 flex items-center gap-1.5">
                    DZ Connect AI
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                      Facebook Page
                    </span>
                  </h2>
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    نشط الآن • {health?.gemini_fast_model || 'gemini-3.8-flash'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleResetMemory}
                  title="مسح الذاكرة الحالية"
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-slate-750 px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">مسح الذاكرة</span>
                </button>
              </div>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60vh] min-h-[400px]">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  {msg.sender === 'model' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shadow shrink-0 self-end mb-5">
                      DZ
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${msg.sender === 'user' ? 'items-start' : 'items-end'}`}>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap transition-all ${
                        msg.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                          : 'bg-slate-800 text-slate-100 border border-slate-700/60 rounded-bl-none shadow-md'
                      }`}
                    >
                      {msg.sender === 'model' && msg.isAnimated ? (
                        <TypewriterText
                          text={msg.text}
                          isAnimated={true}
                          onProgress={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                          onComplete={() => {
                            setMessages(prev =>
                              prev.map(m => (m.id === msg.id ? { ...m, isAnimated: false } : m))
                            );
                          }}
                        />
                      ) : (
                        msg.text
                      )}
                    </div>

                    {/* Metadata pills for bot replies */}
                    <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-400">
                      <span>{msg.timestamp}</span>
                      {msg.modelUsed && (
                        <span className="flex items-center gap-1 text-slate-400 bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700">
                          <Cpu className="w-2.5 h-2.5 text-sky-400" />
                          {msg.modelUsed}
                        </span>
                      )}
                      {msg.searchUsed && (
                        <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800">
                          <Search className="w-2.5 h-2.5" />
                          Google Search
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex items-end gap-2.5 justify-end">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-[11px] font-bold text-white shadow shrink-0">
                    DZ
                  </div>
                  <div className="bg-slate-800 border border-slate-700/70 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-3 text-slate-300 shadow-md">
                    <div className="flex items-center gap-1 py-0.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '800ms' }} />
                      <span className="w-2 h-2 rounded-full bg-sky-400 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '800ms' }} />
                      <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '800ms' }} />
                    </div>
                    <span className="text-xs text-slate-300 font-medium">
                      {loadingStatus || 'DZ Connect AI يكتب الآن...'}
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Replies Tray */}
            <div className="px-4 py-2 bg-slate-850/60 border-t border-slate-800/80 flex flex-wrap gap-2 items-center">
              <span className="text-[11px] text-slate-400 font-medium">ردود سريعة:</span>
              <button
                onClick={() => handleSendMessage('شحال سعر صرف الأورو والدولار في السكوار اليوم؟')}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1 transition"
              >
                <Search className="w-3 h-3 text-emerald-400" />
                💶 صرف السكوار
              </button>
              <button
                onClick={() => handleSendMessage('BAC_HELP')}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1 transition"
              >
                <Cpu className="w-3 h-3 text-blue-400" />
                🎓 مساعد الباك
              </button>
              <button
                onClick={() => handleSendMessage('ارسم لي سيارة كلاسيكية في شوارع القصبة بالجزائر العاصمة')}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1 transition"
              >
                <ImageIcon className="w-3 h-3 text-purple-400" />
                🎨 توليد صورة
              </button>
              <button
                onClick={() => handleSendMessage('مساعدة')}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1 transition"
              >
                <HelpCircle className="w-3 h-3 text-sky-400" />
                ❓ مساعدة
              </button>
              <button
                onClick={() => handleSendMessage('ابدأ من جديد')}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-full border border-slate-700 flex items-center gap-1 transition"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                🗑️ مسح الذاكرة
              </button>
            </div>

            {/* Image Preview if selected */}
            {imagePreview && (
              <div className="px-4 py-2 bg-slate-800 border-t border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img src={imagePreview} alt="Preview" className="w-12 h-12 rounded object-cover border border-slate-600" />
                  <span className="text-xs text-slate-300">تم إرفاق صورة جاهزة للتحليل بالذكاء الاصطناعي</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedImage(null);
                    setImagePreview(null);
                  }}
                  className="text-xs text-rose-400 hover:underline"
                >
                  إلغاء
                </button>
              </div>
            )}

            {/* Input Bar */}
            <div className="p-3 bg-slate-850 border-t border-slate-800 flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="إرفاق صورة"
                className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-xl transition"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  handleSendMessage('هذه محاكاة لرسالة صوتية بالدارجة: سلام عليكم، حبيت نسولك على طريقة التسجيل في المسابقة؟');
                }}
                title="محاكاة رسالة صوتية 🎙️"
                className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition"
              >
                <Mic className="w-5 h-5" />
              </button>

              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="اكتب رسالة بالعربية أو الدارجة الجزائريّة..."
                className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={isLoading || (!inputText.trim() && !selectedImage)}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition shadow"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Webhook Tester */}
        {activeTab === 'webhook' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                1. التحقق من Webhook (GET /webhook)
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                تستخدمه Meta Facebook للتحقق من ملكية السيرفر عندما تضيف رابط الويب هوك في لوحة مطوري فيسبوك.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="flex-1 w-full">
                  <label className="block text-xs text-slate-400 mb-1">Verify Token:</label>
                  <input
                    type="text"
                    value={webhookVerifyToken}
                    onChange={e => setWebhookVerifyToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <button
                  onClick={testWebhookGet}
                  className="w-full sm:w-auto mt-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  اختبار الـ Challenge
                </button>
              </div>

              {verifyResult && (
                <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    {verifyResult.challengeReturned ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> نجح التحقق (200 OK)
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" /> فشل التحقق
                      </span>
                    )}
                  </div>
                  <pre className="text-slate-400 overflow-x-auto">{JSON.stringify(verifyResult, null, 2)}</pre>
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                2. إرسال حمولة رسالة (POST /webhook)
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                محاكاة وصول حدث حقيقي من Facebook Graph API بمعرّف المستخدم ومحتوى الرسالة.
              </p>

              <textarea
                value={webhookPayload}
                onChange={e => setWebhookPayload(e.target.value)}
                rows={10}
                className="w-full bg-slate-950 border border-slate-700 font-mono text-xs text-slate-200 p-3 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              <div className="mt-3 flex justify-end">
                <button
                  onClick={testWebhookPost}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  إرسال الحدث إلى البوت
                </button>
              </div>

              {webhookResult && (
                <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <div className="text-emerald-400 font-bold mb-1">نتيجة الرد:</div>
                  <pre className="text-slate-400 overflow-x-auto">{JSON.stringify(webhookResult, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Analytics & Health */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            {/* System Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
                <span className="text-xs text-slate-400">حالة البوت</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-3 h-3 rounded-full ${health?.status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-lg font-bold uppercase">{health?.status || 'Unknown'}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Gemini API: {health?.gemini_configured ? 'مُهيأ بنجاح ✅' : 'مفتاح غير متوفر ⚠️'}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
                <span className="text-xs text-slate-400">النموذج النشط</span>
                <div className="text-base font-bold text-sky-400 mt-1 truncate">
                  {health?.gemini_fast_model || 'gemini-3.8-flash'}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  النموذج القوي: {health?.gemini_strong_model || 'gemini-3.8-flash'}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
                <span className="text-xs text-slate-400">الحدود اليومية المجانية</span>
                <div className="text-base font-bold text-white mt-1">
                  {health?.daily_user_limit || 50} رسالة / مستخدم
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  الوسائط: {health?.daily_media_limit || 10} | الصعبة: {health?.daily_strong_limit || 5}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
                <span className="text-xs text-slate-400">قاعدة البيانات & الذاكرة</span>
                <div className="text-base font-bold text-emerald-400 mt-1">
                  In-Memory Store
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  احتفاظ السياق والرسائل نشط
                </p>
              </div>
            </div>

            {/* Model Usage Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                استهلاك النماذج وسرعة الاستجابة (Model Usage)
              </h3>
              {stats?.model_usage && stats.model_usage.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">التاريخ</th>
                        <th className="p-2.5">النموذج</th>
                        <th className="p-2.5">عدد الطلبات</th>
                        <th className="p-2.5">الأخطاء</th>
                        <th className="p-2.5">متوسط الاستجابة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {stats.model_usage.map((row: any, i: number) => {
                        const avg = row.requests > 0 ? Math.round(row.total_latency_ms / row.requests) : 0;
                        return (
                          <tr key={i} className="hover:bg-slate-800/40">
                            <td className="p-2.5 font-mono">{row.usage_date}</td>
                            <td className="p-2.5 font-semibold text-sky-300">{row.model}</td>
                            <td className="p-2.5">{row.requests}</td>
                            <td className="p-2.5 text-rose-400">{row.failures}</td>
                            <td className="p-2.5 font-mono text-emerald-400">{avg} ms</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">لا توجد إحصائيات بعد. أرسل رسالة في المحاكي للتسجيل.</p>
              )}
            </div>

            {/* App Activity Stats */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                نشاط التطبيق اليومي (App Stats)
              </h3>
              {stats?.app_stats && stats.app_stats.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">التاريخ</th>
                        <th className="p-2.5">الأحداث المستلمة</th>
                        <th className="p-2.5">طلبات الذكاء الاصطناعي</th>
                        <th className="p-2.5">الرسائل المرسلة</th>
                        <th className="p-2.5">أخطاء الذكاء الاصطناعي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {stats.app_stats.map((row: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-2.5 font-mono">{row.stat_date}</td>
                          <td className="p-2.5">{row.received_events}</td>
                          <td className="p-2.5 font-semibold text-sky-400">{row.ai_requests}</td>
                          <td className="p-2.5 text-emerald-400">{row.sent_messages}</td>
                          <td className="p-2.5 text-rose-400">{row.ai_errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500">لا توجد أحداث مسجلة بعد.</p>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: Setup Guide */}
        {activeTab === 'setup' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                دليل ربط بوت Messenger مع صفحة فيسبوك
              </h2>
              <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sky-400 mb-1">الخطوة 1: رابط الويب هوك (Webhook URL)</h4>
                  <p className="mb-2">
                    في لوحة Meta for Developers &gt; Messenger &gt; Settings &gt; Webhooks، عيّن الرابط التالي:
                  </p>
                  <code className="block bg-slate-900 p-2 rounded text-emerald-400 font-mono select-all">
                    https://ais-dev-un6ddujaxtvnot676owfty-159153712611.us-east1.run.app/webhook
                  </code>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sky-400 mb-1">الخطوة 2: رمز التحقق (Verify Token)</h4>
                  <p className="mb-2">
                    أدخل نفس الرمز المحدد في المتغير <code className="text-amber-300">VERIFY_TOKEN</code> (مثل:{' '}
                    <code className="text-amber-300">my_verify_token</code>).
                  </p>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sky-400 mb-1">الخطوة 3: حقول الاشتراك (Webhook Subscriptions)</h4>
                  <p>
                    اشترك في الحقول التالية: <code className="text-blue-300">messages</code> و{' '}
                    <code className="text-blue-300">messaging_postbacks</code>.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <h4 className="font-bold text-sky-400 mb-1">الخطوة 4: متغيرات البيئة الأساسية</h4>
                  <ul className="list-disc list-inside space-y-1 font-mono text-slate-400">
                    <li>
                      <span className="text-amber-400">PAGE_ACCESS_TOKEN</span>: توكن صفحة فيسبوك لإرسال الردود.
                    </li>
                    <li>
                      <span className="text-amber-400">APP_SECRET</span>: سر التطبيق للتحقق من توقيع X-Hub-Signature-256.
                    </li>
                    <li>
                      <span className="text-amber-400">GEMINI_API_KEY</span>: مفتاح Google Gemini للذكاء الاصطناعي.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
