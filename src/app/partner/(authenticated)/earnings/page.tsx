"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  TrendingUp,
  Percent,
  PlusCircle,
  Loader2,
  ChevronRight,
  AlertCircle,
  IndianRupee,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
} from "lucide-react";
import { toast } from "react-hot-toast";

interface WalletData {
  balance: number;
  currency: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  reference_id: string | null;
  created_at: string;
}

interface WalletStats {
  total_earned: number;
  total_commission_paid: number;
  net_earnings: number;
  recharge_total: number;
  commissions_this_month: number;
  earnings_this_month: number;
}

type FilterType = "all" | "credit" | "debit" | "commission" | "recharge" | "pending_recharge" | "withdrawal";

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string; sign: "+" | "-" }> = {
  credit: { label: "Job Earning", icon: <ArrowDownLeft size={14} />, color: "text-emerald-600", bg: "bg-emerald-50", sign: "+" },
  online_credit: { label: "Online Credit", icon: <ArrowDownLeft size={14} />, color: "text-emerald-600", bg: "bg-emerald-50", sign: "+" },
  recharge: { label: "Add Money", icon: <PlusCircle size={14} />, color: "text-indigo-600", bg: "bg-indigo-50", sign: "+" },
  pending_recharge: { label: "Add Money (Pending)", icon: <Clock size={14} />, color: "text-amber-600", bg: "bg-amber-50", sign: "+" },
  debit: { label: "Withdrawal", icon: <ArrowUpRight size={14} />, color: "text-red-600", bg: "bg-red-50", sign: "-" },
  commission: { label: "Commission", icon: <Percent size={14} />, color: "text-orange-600", bg: "bg-orange-50", sign: "-" },
  refund: { label: "Refund", icon: <ArrowDownLeft size={14} />, color: "text-blue-600", bg: "bg-blue-50", sign: "+" },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending_recharge: <Clock size={12} className="text-amber-500" />,
  success: <CheckCircle2 size={12} className="text-emerald-500" />,
  failed: <XCircle size={12} className="text-red-500" />,
};

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "recharge", label: "Added" },
  { key: "credit", label: "Earnings" },
  { key: "commission", label: "Commission" },
  { key: "debit", label: "Withdrawn" },
];

export default function WalletPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);

  const fetchWalletData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [walletRes, withdrawRes] = await Promise.all([
        fetch("/api/worker/wallet?limit=50"),
        fetch("/api/worker/withdraw"),
      ]);

      const walletJson = await walletRes.json();
      if (!walletRes.ok) throw new Error(walletJson.error || "Failed to load wallet");
      
      setWallet(walletJson.data.wallet);
      setTransactions(walletJson.data.transactions || []);
      setStats(walletJson.data.stats);

      // Calculate total withdrawn from payout_logs
      if (withdrawRes.ok) {
        const withdrawJson = await withdrawRes.json();
        const completedWithdrawals = (withdrawJson.data?.payouts || [])
          .filter((p: any) => p.status === "completed" || p.status === "processing")
          .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        setTotalWithdrawn(completedWithdrawals);
      }
    } catch (err: any) {
      console.error("[Wallet] Load error:", err);
      toast.error(err.message || "Failed to load wallet data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const filteredTransactions = transactions.filter((t) => {
    if (filter === "all") return true;
    if (filter === "recharge") return t.type === "recharge" || t.type === "pending_recharge" || t.type === "online_credit";
    if (filter === "credit") return t.type === "credit" || t.type === "online_credit";
    if (filter === "debit") return t.type === "debit";
    if (filter === "commission") return t.type === "commission";
    return t.type === filter;
  });

  const balance = Number(wallet?.balance ?? 0);
  const maxWithdrawable = Math.max(0, balance - 500);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
        <p className="text-sm text-gray-500 font-medium">Loading wallet...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between px-4 py-4 max-w-2xl mx-auto">
          <div>
            <h1 className="text-base font-black text-gray-900">My Wallet</h1>
            <p className="text-xs text-gray-500">Balance & Transactions</p>
          </div>
          <button
            onClick={() => fetchWalletData(true)}
            disabled={refreshing}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Balance Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/25">
          {/* Decorative circles */}
          <div className="absolute -top-8 -right-8 w-36 h-36 bg-white/5 rounded-full" />
          <div className="absolute -bottom-10 -left-6 w-28 h-28 bg-white/5 rounded-full" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={16} className="text-indigo-200" />
              <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider">Available Balance</p>
            </div>
            <div className="flex items-end gap-1 mt-2">
              <span className="text-indigo-200 text-2xl font-black">₹</span>
              <span className="text-5xl font-black leading-none">
                {Math.floor(balance).toLocaleString("en-IN")}
              </span>
              <span className="text-indigo-200 text-xl font-bold mb-1">
                .{String(Math.round((balance % 1) * 100)).padStart(2, "0")}
              </span>
            </div>
            {balance > 0 && (
              <p className="text-indigo-300 text-xs font-medium mt-2">
                ₹{maxWithdrawable.toLocaleString("en-IN")} withdrawable · ₹500 reserved
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="relative mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => router.push("/partner/earnings/add-money")}
              className="flex items-center justify-center gap-2 bg-white text-indigo-700 font-black text-sm py-3.5 rounded-2xl shadow-sm hover:bg-indigo-50 active:scale-95 transition-all"
            >
              <PlusCircle size={18} />
              Add Money
            </button>
            <button
              onClick={() => router.push("/partner/earnings/withdraw")}
              className="flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 active:scale-95 text-white border border-white/20 font-black text-sm py-3.5 rounded-2xl transition-all"
            >
              <ArrowUpRight size={18} />
              Withdraw
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-50 flex items-center justify-center">
                <ArrowDownLeft size={12} className="text-emerald-600" />
              </div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Added</p>
            </div>
            <p className="text-base font-black text-gray-900">
              ₹{(stats?.recharge_total ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center">
                <ArrowUpRight size={12} className="text-red-500" />
              </div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Withdrawn</p>
            </div>
            <p className="text-base font-black text-gray-900">
              ₹{totalWithdrawn.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-6 h-6 rounded-full bg-orange-50 flex items-center justify-center">
                <Percent size={12} className="text-orange-500" />
              </div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Commission</p>
            </div>
            <p className="text-base font-black text-gray-900">
              ₹{(stats?.total_commission_paid ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Lifetime Earnings Banner */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <TrendingUp size={18} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Lifetime Earnings</p>
              <p className="text-lg font-black text-gray-900">
                ₹{(stats?.total_earned ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Net Earnings</p>
            <p className="text-base font-black text-emerald-600">
              ₹{(stats?.net_earnings ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Transaction History */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                <IndianRupee size={14} className="text-indigo-500" />
                Transaction History
              </h2>
              <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                {filteredTransactions.length} records
              </span>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`flex-shrink-0 text-[11px] font-black px-3 py-1.5 rounded-full transition-all ${
                    filter === tab.key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Transaction List */}
          {filteredTransactions.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                <IndianRupee size={24} className="text-gray-300" />
              </div>
              <p className="text-sm font-bold text-gray-400">No transactions found</p>
              <p className="text-xs text-gray-300 mt-1">
                {filter === "all" ? "Your transaction history will appear here" : `No ${filter} transactions yet`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredTransactions.map((tx) => {
                const config = TYPE_CONFIG[tx.type] || {
                  label: tx.type,
                  icon: <IndianRupee size={14} />,
                  color: "text-gray-600",
                  bg: "bg-gray-50",
                  sign: "+" as const,
                };
                const isCredit = config.sign === "+";
                const date = new Date(tx.created_at);

                return (
                  <div key={tx.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-full ${config.bg} ${config.color} flex items-center justify-center flex-shrink-0`}>
                      {config.icon}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-gray-800 truncate">{config.label}</p>
                        {tx.type === "pending_recharge" && (
                          <Clock size={11} className="text-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5 truncate">
                        {tx.description || (tx.reference_id ? `Ref: ${tx.reference_id}` : "—")}
                      </p>
                      <p className="text-[10px] text-gray-300 font-semibold mt-0.5">
                        {date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}
                        {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-black ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
                        {config.sign}₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-gray-300 font-semibold mt-0.5">
                        Bal: ₹{Number(tx.balance_after).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Security Note */}
        <p className="text-center text-xs text-gray-400 font-medium pb-2">
          🔒 All transactions are encrypted and secured. Contact support@zolvo.in for disputes.
        </p>
      </div>
    </div>
  );
}
