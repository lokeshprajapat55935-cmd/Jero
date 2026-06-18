"use client";

import React, { useEffect, useState } from "react";
import { Wallet, TrendingDown, TrendingUp, AlertTriangle, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { adminFetch } from "@/lib/admin/api";

interface WorkerWallet {
  worker_id: string;
  balance: number;
  currency: string;
  profile?: {
    full_name: string;
    phone: string;
    avatar_url: string;
  };
}

interface WalletTransaction {
  id: string;
  worker_id: string;
  type: string;
  amount: number;
  balance_after: number;
  booking_id?: string;
  description: string;
  created_at: string;
}

export function AdminWalletPanel() {
  const { toast } = useToast();
  const [wallets, setWallets] = useState<WorkerWallet[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<WorkerWallet | null>(null);
  const [workerDetail, setWorkerDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);

  const [adjustForm, setAdjustForm] = useState({
    type: "credit" as "credit" | "debit" | "adjustment",
    amount: "",
    description: "",
  });

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/wallet");
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setWallets(json.data?.wallets || []);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to load wallets", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkerDetail = async (workerId: string) => {
    try {
      const res = await adminFetch(`/api/admin/wallet?worker_id=${workerId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      setWorkerDetail(json.data);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed to load worker detail", description: err.message });
    }
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  const handleSelectWorker = (wallet: WorkerWallet) => {
    setSelectedWorker(wallet);
    fetchWorkerDetail(wallet.worker_id);
  };

  const handleAdjust = async () => {
    if (!selectedWorker) return;
    const amount = parseFloat(adjustForm.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Invalid amount" });
      return;
    }
    if (!adjustForm.description.trim() || adjustForm.description.length < 5) {
      toast({ variant: "destructive", title: "Please provide a reason (min 5 chars)" });
      return;
    }

    setAdjusting(true);
    try {
      const res = await adminFetch("/api/admin/wallet", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: selectedWorker.worker_id,
          amount,
          type: adjustForm.type,
          description: adjustForm.description,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);

      toast({
        title: "Wallet Updated",
        description: `${adjustForm.type === "credit" ? "Credited" : "Debited"} ₹${amount}. New balance: ₹${json.data?.new_balance?.toFixed(0)}`,
      });

      setAdjustForm({ type: "credit", amount: "", description: "" });
      fetchWallets();
      fetchWorkerDetail(selectedWorker.worker_id);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Adjustment failed", description: err.message });
    } finally {
      setAdjusting(false);
    }
  };

  const txTypeColor = (type: string) => {
    if (type === "commission" || type === "debit") return "text-red-500";
    if (type === "credit" || type === "online_credit" || type === "recharge") return "text-emerald-600";
    return "text-blue-500";
  };

  const txSign = (type: string) =>
    type === "commission" || type === "debit" ? "-" : "+";

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      {/* Worker Wallet List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Worker Wallets</h2>
          <Button size="sm" variant="outline" onClick={fetchWallets} className="h-8 gap-1.5 text-xs font-bold">
            <RefreshCw size={13} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-secondary/30 animate-pulse" />
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No worker wallets found.</div>
        ) : (
          <div className="space-y-2">
            {wallets.map((w) => (
              <button
                key={w.worker_id}
                onClick={() => handleSelectWorker(w)}
                className={cn(
                  "w-full text-left rounded-xl border p-4 transition-all hover:bg-secondary/20",
                  selectedWorker?.worker_id === w.worker_id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card",
                  Number(w.balance) < 500 && "border-red-200 bg-red-500/5"
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-black text-foreground">
                      {w.profile?.full_name || "Worker"}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                      {w.profile?.phone || w.worker_id.slice(0, 8)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-base font-black",
                      Number(w.balance) < 500 ? "text-red-500" : "text-foreground"
                    )}>
                      ₹{Number(w.balance).toFixed(0)}
                    </p>
                    {Number(w.balance) < 500 && (
                      <span className="flex items-center justify-end gap-1 text-[9px] text-red-500 font-bold mt-0.5">
                        <AlertTriangle size={9} /> Low Balance
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Worker Detail + Adjustment Panel */}
      <div className="lg:col-span-3 space-y-5">
        {!selectedWorker ? (
          <Card className="p-12 text-center text-muted-foreground">
            <Wallet size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold">Select a worker to view details</p>
            <p className="text-xs mt-1">Click any worker on the left to manage their wallet</p>
          </Card>
        ) : (
          <>
            {/* Worker Summary */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Selected Worker</p>
                  <h3 className="text-xl font-black mt-0.5">
                    {workerDetail?.worker?.full_name || "Worker"}
                  </h3>
                  <p className="text-xs text-muted-foreground font-semibold">
                    {workerDetail?.worker?.phone}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Current Balance</p>
                  <p className={cn(
                    "text-3xl font-black mt-0.5",
                    Number(workerDetail?.wallet?.balance || 0) < 500 ? "text-red-500" : "text-foreground"
                  )}>
                    ₹{Number(workerDetail?.wallet?.balance || 0).toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Quick stats row */}
              {workerDetail?.transactions && (
                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/40">
                  {[
                    {
                      label: "Total Recharges",
                      value: workerDetail.transactions.filter((t: any) => t.type === "recharge").reduce((s: number, t: any) => s + Number(t.amount), 0),
                      icon: TrendingUp,
                      color: "text-emerald-600",
                    },
                    {
                      label: "Commission Paid",
                      value: workerDetail.transactions.filter((t: any) => t.type === "commission").reduce((s: number, t: any) => s + Number(t.amount), 0),
                      icon: TrendingDown,
                      color: "text-orange-500",
                    },
                    {
                      label: "Online Credits",
                      value: workerDetail.transactions.filter((t: any) => t.type === "online_credit").reduce((s: number, t: any) => s + Number(t.amount), 0),
                      icon: Wallet,
                      color: "text-primary",
                    },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="text-center rounded-xl bg-secondary/20 p-3">
                      <Icon size={16} className={cn("mx-auto mb-1", color)} />
                      <p className={cn("text-base font-black", color)}>₹{value.toFixed(0)}</p>
                      <p className="text-[9px] text-muted-foreground font-bold mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Adjustment Form */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">
                Manual Adjustment
              </h3>

              <div className="grid grid-cols-3 gap-2">
                {(["credit", "debit", "adjustment"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAdjustForm(prev => ({ ...prev, type: t }))}
                    className={cn(
                      "h-9 rounded-lg border text-xs font-black capitalize transition-all",
                      adjustForm.type === t
                        ? t === "credit"
                          ? "bg-emerald-500 text-white border-emerald-400"
                          : t === "debit"
                          ? "bg-red-500 text-white border-red-400"
                          : "bg-blue-500 text-white border-blue-400"
                        : "border-border text-muted-foreground hover:bg-secondary/50"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground">Amount (₹)</label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="h-10 rounded-xl font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground">Reason / Description</label>
                <Input
                  type="text"
                  placeholder="Reason for adjustment (required)"
                  value={adjustForm.description}
                  onChange={(e) => setAdjustForm(prev => ({ ...prev, description: e.target.value }))}
                  className="h-10 rounded-xl font-bold"
                />
              </div>

              <Button
                onClick={handleAdjust}
                isLoading={adjusting}
                disabled={!adjustForm.amount || !adjustForm.description}
                className={cn(
                  "w-full h-11 rounded-xl font-black text-sm",
                  adjustForm.type === "credit"
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                    : adjustForm.type === "debit"
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                )}
              >
                Apply {adjustForm.type.charAt(0).toUpperCase() + adjustForm.type.slice(1)}
              </Button>
            </Card>

            {/* Transaction History */}
            {workerDetail?.transactions && workerDetail.transactions.length > 0 && (
              <Card className="overflow-hidden p-0 rounded-2xl">
                <div className="px-5 py-3.5 border-b border-border/40">
                  <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Transaction History ({workerDetail.transactions.length})
                  </p>
                </div>
                <div className="divide-y divide-border/60 max-h-72 overflow-y-auto">
                  {workerDetail.transactions.map((tx: WalletTransaction) => (
                    <div key={tx.id} className="px-5 py-3 flex items-start justify-between gap-4 hover:bg-secondary/10">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-foreground truncate">{tx.description}</p>
                        <p className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                          {new Date(tx.created_at).toLocaleString()} · Bal after: ₹{Number(tx.balance_after).toFixed(0)}
                        </p>
                        {tx.booking_id && (
                          <p className="text-[9px] text-primary font-bold mt-0.5">
                            Booking: #{tx.booking_id.slice(0, 8)}
                          </p>
                        )}
                      </div>
                      <span className={cn("text-sm font-black shrink-0", txTypeColor(tx.type))}>
                        {txSign(tx.type)}₹{Number(tx.amount).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
