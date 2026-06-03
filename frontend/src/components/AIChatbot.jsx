import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Navigation, Tag, WifiOff, CreditCard, Mic, MapPin } from 'lucide-react';
import { AI_RESPONSES } from '../data/mockData';
import evBanner from '../assets/ev_banner.png';

const SUGGESTIONS = [
  { text: 'Can I reach Noida with 30% battery?', icon: Navigation, color: 'text-sky-400', bg: 'bg-sky-500/[.06] border-sky-500/15' },
  { text: 'Cheapest charger near me?', icon: Tag, color: 'text-amber-400', bg: 'bg-amber-500/[.06] border-amber-500/15' },
  { text: 'How does offline mode work?', icon: WifiOff, color: 'text-violet-400', bg: 'bg-violet-500/[.06] border-violet-500/15' },
  { text: 'How do I pay across networks?', icon: CreditCard, color: 'text-emerald-400', bg: 'bg-emerald-500/[.06] border-emerald-500/15' },
];

export default function AIChatbot({ balance = 1250, co2Total = 85.4, userSoc = 72 }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const handleSend = (text) => {
    const q = (text || input).trim();
    if (!q) return;

    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    setTyping(true);

    setTimeout(() => {
      const lower = q.toLowerCase();
      let reply;
      if (lower.includes('reach') || lower.includes('range') || lower.includes('battery') || lower.includes('noida')) {
        const socMatch = lower.match(/(\d+)%?/);
        const soc = socMatch ? parseInt(socMatch[1]) : userSoc;
        reply = AI_RESPONSES.range(soc, 'Noida');
      } else if (lower.includes('cheap') || lower.includes('cost') || lower.includes('price')) {
        reply = AI_RESPONSES.cheapest;
      } else if (lower.includes('offline') || lower.includes('internet') || lower.includes('edge')) {
        reply = AI_RESPONSES.offline;
      } else if (lower.includes('pay') || lower.includes('wallet') || lower.includes('upi')) {
        reply = AI_RESPONSES.payment;
      } else if (lower.includes('hello') || lower.includes('hi')) {
        reply = "Hello! I'm your EVConnect AI Assistant. Ask me anything about routes, payments, or offline charging. ⚡🚗";
      } else {
        reply = "I specialize in EV routing, cross-network roaming, and payments. Ask me a question from the suggestions list below!";
      }

      setMessages(prev => [...prev, { role: 'bot', text: reply }]);
      setTyping(false);
    }, 850);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend();
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      
      {/* ─── Top Banner ─── */}
      <div className="relative rounded-2xl overflow-hidden glass border-white/[.06] flex items-center justify-between p-4 md:p-6 h-28 md:h-36">
        <div className="relative z-10 flex items-start gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-sky-500 flex items-center justify-center shadow-lg shadow-violet-500/20 shrink-0">
            <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-white keep-white" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
              AI Charging Assistant
            </h3>
            <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">Powered by EVConnect LLM</p>
            <div className="hidden sm:flex items-center gap-4 mt-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-blink" />
                Last System Check: 5 min ago
              </span>
              <span className="flex items-center gap-1.5">
                ⚡ Battery health
                <span className="inline-flex gap-0.5 items-center bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded text-emerald-400 font-bold text-[8px]">
                  🔋 100%
                </span>
              </span>
            </div>
          </div>
        </div>
        
        {/* Banner image layout right side */}
        <div className="absolute right-0 top-0 bottom-0 w-[45%] overflow-hidden pointer-events-none hidden md:block">
          <div className="absolute inset-0 banner-gradient z-10" />
          <img src={evBanner} alt="EV Charging" className="w-full h-full object-cover object-center opacity-85" />
        </div>
      </div>

      {/* ─── Center Panels (2 Columns on md+, stacked on mobile) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 items-stretch">
        
        {/* Left Column: Chat or Intro Box */}
        <div className="md:col-span-7 glass border-white/[.06] rounded-2xl p-4 md:p-5 min-h-[250px] md:min-h-[300px] flex flex-col justify-between">
          {messages.length === 0 ? (
            // Landing intro card
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">👋 Hi, I'm your EVConnect AI Assistant! ⚡</h4>
                  <p className="text-xs text-slate-400 mt-1">I can help with:</p>
                </div>
              </div>
              <ul className="space-y-2 pl-11 text-xs text-slate-300">
                <li className="list-disc leading-relaxed">"Can I reach Noida with 30% battery?"</li>
                <li className="list-disc leading-relaxed">"Cheapest charger near me?"</li>
                <li className="list-disc leading-relaxed">"How does offline mode work?"</li>
                <li className="list-disc leading-relaxed">"How do I pay across networks?"</li>
              </ul>
            </div>
          ) : (
            // Chat history messages list
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 max-h-[260px] md:max-h-[320px]">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 md:gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-slide-up`}>
                  <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-sky-500/10 text-sky-400' : 'bg-violet-500/10 text-violet-400'
                  }`}>
                    <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </div>
                  <div className={`max-w-[85%] md:max-w-[80%] px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-[11px] md:text-xs leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/20'
                      : 'bg-white/[.02] border border-white/[.05] text-slate-300'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex gap-3 animate-fade-in">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="glass px-4 py-2.5 rounded-xl">
                    <div className="flex gap-1.5 items-center h-4">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Right Column: EV Overview Panel */}
        <div className="md:col-span-5 glass border-white/[.06] rounded-2xl p-4 md:p-5 flex items-stretch">
          <div className="grid grid-cols-12 gap-3 md:gap-4 w-full">
            
            {/* Battery Cylinder layout */}
            <div className="col-span-4 flex flex-col items-center justify-center relative py-2">
              <div className="relative w-12 md:w-14 h-28 md:h-32 border-2 border-slate-700/80 rounded-2xl bg-slate-950 flex flex-col justify-end p-0.5 overflow-hidden shadow-[0_0_12px_rgba(0,0,0,0.4)]">
                {/* Battery Cap */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4 h-1 bg-slate-700 rounded-b-md z-10" />
                {/* Glow layer */}
                <div className="absolute inset-0 bg-sky-500/5 blur-sm" />
                {/* Energy liquid fill */}
                <div className="w-full rounded-xl bg-gradient-to-t from-emerald-500 via-emerald-400 to-emerald-300 shadow-[0_-4px_16px_rgba(52,211,153,0.5)] transition-all duration-1000"
                  style={{ height: `${userSoc}%` }}
                />
              </div>
            </div>

            {/* EV Overview text fields */}
            <div className="col-span-8 flex flex-col justify-between py-1">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] text-sky-400 font-extrabold uppercase tracking-widest mb-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Your EV Overview
                </div>
                
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-[10px] text-slate-500 font-semibold">Battery Level</span>
                  <span className="text-[10px] text-slate-500 font-semibold">Est. Range</span>
                </div>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-lg md:text-xl font-black font-display text-white">{userSoc}%</span>
                  <span className="text-sm font-extrabold font-display text-slate-200">{Math.round(437 * userSoc / 100)} km</span>
                </div>

                {/* Range progress bar */}
                <div className="w-full h-1.5 rounded-full bg-white/[.05] overflow-hidden mb-3 md:mb-4">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" style={{ width: `${userSoc}%` }} />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-semibold">Next Charging</div>
                      <div className="text-[11px] text-white font-medium mt-0.5">Generic EV Model 3</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Savings metrics grid */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[.05]">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase font-bold">Total Savings</span>
                  <div className="text-xs font-bold text-emerald-400 font-display mt-0.5">₹{Math.round(balance)}</div>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 uppercase font-bold">CO₂ Saved</span>
                  <div className="text-xs font-bold text-sky-400 font-display mt-0.5">₹{Math.round(co2Total)} kg</div>
                </div>
              </div>

            </div>

          </div>
        </div>

      </div>

      {/* ─── Suggestion Pills Row ─── */}
      <div className="flex gap-2 md:gap-2.5 overflow-x-auto py-1 -mx-1 px-1 scrollbar-hide">
        {SUGGESTIONS.map(({ text, icon: Icon, color, bg }, i) => (
          <button
            key={i}
            onClick={() => handleSend(text)}
            className={`flex items-center gap-1.5 md:gap-2 text-[10px] md:text-[11px] font-semibold border rounded-full px-3 md:px-4 py-2 md:py-2.5 whitespace-nowrap hover:bg-white/[.04] transition-all cursor-pointer ${bg}`}
          >
            <Icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${color} shrink-0`} />
            <span className="text-slate-300">{text}</span>
          </button>
        ))}
      </div>

      {/* ─── Chat Input area ─── */}
      <div className="space-y-2">
        <form onSubmit={handleSubmit} className="relative glass border-white/[.07] focus-within:border-sky-500/25 rounded-2xl p-3 flex flex-col justify-between h-24 md:h-28">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 500))}
            placeholder="Ask me anything about EV charging..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none resize-none h-12 md:h-14"
          />
          <div className="flex justify-between items-center pt-2">
            <span className="text-[10px] text-slate-600 font-mono">{input.length} / 500</span>
            <div className="flex items-center gap-2">
              <button type="button" className="p-1.5 md:p-2 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-white/[.04] transition-colors">
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-8 h-8 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 flex items-center justify-center disabled:opacity-20 transition-all cursor-pointer active:scale-95 shadow-md shadow-sky-500/10"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
        <p className="text-[9px] text-slate-600 text-center font-medium">
          EVConnect AI may make mistakes. Please verify important information.
        </p>
      </div>

    </div>
  );
}
