"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  PlusCircle,
  Smartphone,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Zap,
} from "lucide-react";

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 50000;

export default function AddMoneyPage() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const parsedAmount = parseFloat(amount) || 0;

  const validate = (): string => {
    if (!amount || parsedAmount <= 0) return "Please enter an amount";
    if (parsedAmount < MIN_AMOUNT) return `Minimum add amount is ₹${MIN_AMOUNT}`;
    if (parsedAmount > MAX_AMOUNT) return `Maximum add amount is ₹${MAX_AMOUNT.toLocaleString("en-IN")}`;
    return "";
  };

  const handleAmountChange = (val: string) => {
    // Allow only numbers and one decimal point
    const cleaned = val.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
    setAmount(cleaned);
    setError("");
  };

  const handleQuickSelect = (val: number) => {
    setAmount(String(val));
    setError("");
  };

  const handleAddMoney = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/worker/wallet/add-money", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to initiate payment");
      }

      if (json.data?.paymentUrl) {
        // Redirect to PhonePe payment page
        toast.success("Redirecting to payment gateway...");
        window.location.href = json.data.paymentUrl;
      } else {
        throw new Error("Payment gateway did not return a redirect URL");
      }
    } catch (err: any) {
      console.error("[AddMoney] Error:", err);
      setError(err.message || "Something went wrong. Please try again.");
      toast.error(err.message || "Payment initiation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-black text-gray-900">Add Money</h1>
            <p className="text-xs text-gray-500">Top up your Zolvo wallet</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Amount Input Card */}
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
          <div>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
              Enter Amount
            </label>

            {/* Amount field */}
            <div className={`flex items-center gap-2 border-2 rounded-2xl px-4 py-4 transition-all ${
              error
                ? "border-red-300 bg-red-50/50"
                : parsedAmount > 0
                ? "border-indigo-400 bg-indigo-50/30"
                : "border-gray-200 bg-gray-50"
            }`}>
              <span className="text-2xl font-black text-gray-400">₹</span>
              <input
                type="tel"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="flex-1 text-3xl font-black text-gray-900 bg-transparent outline-none placeholder:text-gray-200"
                autoFocus
              />
              {parsedAmount > 0 && (
                <button
                  onClick={() => { setAmount(""); setError(""); }}
                  className="text-gray-300 hover:text-gray-500 transition-colors text-xl font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-1.5 mt-2 text-red-500">
                <AlertCircle size={13} />
                <p className="text-xs font-semibold">{error}</p>
              </div>
            )}
            <p className="text-[10px] text-gray-400 font-medium mt-2">
              Min ₹{MIN_AMOUNT} · Max ₹{MAX_AMOUNT.toLocaleString("en-IN")}
            </p>
          </div>

          {/* Quick Select Amounts */}
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">Quick Select</p>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_AMOUNTS.map((val) => (
                <button
                  key={val}
                  onClick={() => handleQuickSelect(val)}
                  className={`py-2.5 rounded-xl text-sm font-black transition-all ${
                    parsedAmount === val
                      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                      : "bg-gray-50 border border-gray-100 text-gray-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  }`}
                >
                  ₹{val >= 1000 ? `${val / 1000}K` : val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Payment Method Card */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Payment Method</p>

          {/* PhonePe — only available method */}
          <div className="flex items-center gap-4 p-4 bg-indigo-50/60 border-2 border-indigo-300 rounded-2xl">
            <div className="w-10 h-10 bg-[#5f259f] rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
              <Smartphone size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-black text-gray-800">PhonePe / UPI / Cards</p>
              <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                Secure payment via PhonePe — all UPI apps & cards accepted
              </p>
            </div>
            <div className="w-5 h-5 rounded-full bg-indigo-600 border-2 border-indigo-600 flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-3 text-gray-400">
            <ShieldCheck size={12} className="text-emerald-500" />
            <p className="text-[10px] font-semibold">256-bit SSL encrypted · PCI-DSS compliant · Instant credit</p>
          </div>
        </div>

        {/* Summary */}
        {parsedAmount >= MIN_AMOUNT && parsedAmount <= MAX_AMOUNT && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 font-semibold">Amount to Add</span>
              <span className="font-black text-gray-900">₹{parsedAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 font-semibold">Platform Fee</span>
              <span className="font-black text-emerald-600">FREE</span>
            </div>
            <div className="border-t border-emerald-200 pt-2 flex justify-between text-sm">
              <span className="font-black text-gray-800">Wallet Credit</span>
              <span className="font-black text-emerald-700">
                +₹{parsedAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* CTA Button */}
        <button
          onClick={handleAddMoney}
          disabled={loading || parsedAmount < MIN_AMOUNT}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 active:scale-[0.98] text-white font-black text-sm py-4 rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin w-4 h-4" />
              Redirecting to payment...
            </>
          ) : (
            <>
              <Zap size={18} />
              Pay ₹{parsedAmount > 0 ? parsedAmount.toLocaleString("en-IN") : "—"} via PhonePe
              <ExternalLink size={14} className="opacity-70" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-400 font-medium">
          You will be redirected to PhonePe to complete payment securely.
        </p>
      </div>
    </div>
  );
}
