import { CreditCard, Plus, Receipt, ArrowDownLeft, ArrowUpRight, Zap, Shield, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export default function WalletPanel({ balance, onTopUp, transactions = [] }) {
  const [topUpAmt, setTopUpAmt] = useState(500);
  const [showTopUpDone, setShowTopUpDone] = useState(false);

  const handleTopUp = () => {
    onTopUp(topUpAmt);
    setShowTopUpDone(true);
    setTimeout(() => setShowTopUpDone(false), 2000);
  };

  // Compute monthly totals per operator
  const opTotals = {};
  transactions.forEach(tx => {
    opTotals[tx.op] = (opTotals[tx.op] || 0) + tx.cost;
  });
  const monthlyTotal = Object.values(opTotals).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in">

      {/* VoltPass Card */}
      <div className="relative rounded-2xl overflow-hidden p-5 md:p-6 h-44 md:h-48 flex flex-col justify-between"
        style={{ background: 'linear-gradient(135deg, #0c1631 0%, #0a1228 50%, #111b3c 100%)' }}>
        <div className="absolute top-[-40px] right-[-40px] w-40 h-40 rounded-full bg-sky-500/[.06] blur-2xl" />
        <div className="absolute bottom-[-30px] left-[-30px] w-32 h-32 rounded-full bg-violet-500/[.05] blur-2xl" />
        <div className="absolute inset-0 border border-white/[.06] rounded-2xl pointer-events-none" />

        <div className="relative z-10 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-bold text-sky-400 tracking-wider uppercase">VoltPass</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1">EV-ID: 8872-OC-UNIVERSAL</div>
          </div>
          <Shield className="w-5 h-5 text-sky-400/40" />
        </div>

        <div className="relative z-10">
          <div className="text-[10px] text-slate-400 uppercase tracking-widest">Unified Balance</div>
          <div className="text-2xl md:text-3xl font-black font-display text-white mt-1">
            ₹{balance.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </div>
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-1">
          <div className="text-[10px] text-slate-400">
            Works across <span className="text-white font-medium">4 CPO networks</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] bg-sky-400/10 text-sky-400 border border-sky-400/15 px-2 py-0.5 rounded-full">
            <CreditCard className="w-3 h-3" /> UPI • Cards • Wallet
          </div>
        </div>
      </div>

      {/* Top Up Section */}
      <div className="glass rounded-xl p-4">
        <div className="text-xs font-bold text-slate-200 mb-3">Quick Top-Up</div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[200, 500, 1000, 2000].map(amt => (
            <button
              key={amt}
              onClick={() => setTopUpAmt(amt)}
              className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                topUpAmt === amt
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-white/[.03] border-white/[.06] text-slate-400 hover:text-white hover:bg-white/[.06]'
              }`}
            >₹{amt}</button>
          ))}
        </div>
        <button
          onClick={handleTopUp}
          className="w-full h-10 md:h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2
            bg-gradient-to-r from-emerald-600/80 to-emerald-500/80 text-white
            hover:from-emerald-500 hover:to-emerald-400 transition-all active:scale-[.98]
            shadow-lg shadow-emerald-600/10"
        >
          {showTopUpDone ? (
            <><CheckCircle2 className="w-4 h-4" /> Added ₹{topUpAmt}!</>
          ) : (
            <><Plus className="w-4 h-4" /> Add ₹{topUpAmt} to Wallet</>
          )}
        </button>
      </div>

      {/* Monthly Summary */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-violet-400" /> Monthly Billing Report
          </span>
          <span className="text-[10px] text-slate-500">June 2026</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {Object.entries(opTotals).slice(0, 3).map(([label, amount]) => (
            <div key={label} className="bg-white/[.03] border border-white/[.05] rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 truncate">{label}</div>
              <div className="text-xs font-bold text-white mt-0.5">₹{Math.round(amount)}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-white/[.06]">
          <span className="text-xs text-slate-300">Total This Month</span>
          <span className="text-sm font-bold font-display text-white">₹{monthlyTotal.toFixed(2)}</span>
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">
          Transaction History ({transactions.length})
        </h4>
        <div className="space-y-2">
          {transactions.length === 0 && (
            <div className="text-center text-sm text-slate-500 py-6">No transactions yet. Start charging!</div>
          )}
          {transactions.map((tx, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/[.02] border border-white/[.04] rounded-xl p-3 hover:bg-white/[.04] transition-colors animate-slide-up"
              style={{ animationDelay: `${i * 50}ms` }}>
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                <ArrowDownLeft className="w-3.5 h-3.5 md:w-4 md:h-4 text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] md:text-xs font-semibold text-white truncate">{tx.op} — {tx.station}</div>
                <div className="text-[10px] text-slate-500">
                  {typeof tx.kwh === 'number' ? tx.kwh.toFixed(1) : tx.kwh} kWh • {tx.type} • {tx.time}
                </div>
              </div>
              <div className="text-xs md:text-sm font-bold text-white shrink-0">-₹{Math.round(tx.cost)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
