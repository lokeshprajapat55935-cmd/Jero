"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  ArrowUpRight,
  Wallet,
  Building2,
  Smartphone,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Info,
  Clock,
} from "lucide-react";

interface BankDetails {
  bank_holder_name: string;
  bank_name: string;
  bank_account_number: string;
  ifsc_code: string;
  upi_id: string;
}

type WithdrawMethod = "bank" | "upi";

const MIN_WITHDRAW = 100;
const MIN_WALLET_RESERVE = 500;

export default function WithdrawPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState(0);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<WithdrawMethod>("bank");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [referenceId, setReferenceId] = useState("");

  const parsedAmount = parseFloat(amount) || 0;
  const maxWithdrawable = Math.max(0, balance - MIN_WALLET_RESERVE);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [walletRes, bankRes] = await Promise.all([
          fetch("/api/worker/wallet"),
          fetch("/api/worker/profile/bank-details"),
        ]);

        const walletJson = await walletRes.json();
        if (walletRes.ok) {
          setBalance(Number(walletJson.data?.wallet?.balance ?? 0));
        }

        const bankJson = await bankRes.json();
        if (bankRes.ok && bankJson.data) {
          setBankDetails(bankJson.data);
          // Auto-select UPI if no bank account set but UPI is available
          if (!bankJson.data.bank_account_number && bankJson.data.upi_id) {
            setMethod("upi");
          }
        }
      } catch (err) {
        console.error("[Withdraw] Fetch error:", err);
        toast.error("Failed to load withdrawal details");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleMaxAmount = () => {
    if (maxWithdrawable > 0) {
      setAmount(String(maxWithdrawable));
      setErrors((e) => ({ ...e, amount: "" }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!amount || parsedAmount <= 0) {
      newErrors.amount = "Please enter an amount";
    } else if (parsedAmount < MIN_WITHDRAW) {
      newErrors.amount = `Minimum withdrawal is ₹${MIN_WITHDRAW}`;
    } else if (parsedAmount > maxWithdrawable) {
      newErrors.amount = `Maximum withdrawable is ₹${maxWithdrawable.toFixed(2)} (₹${MIN_WALLET_RESERVE} reserved)`;
    }

    if (method === "bank") {
      if (!bankDetails?.bank_account_number)
        newErrors.method = "Bank account details missing. Please update your profile first.";
    } else {
      if (!bankDetails?.upi_id)
        newErrors.method = "UPI ID missing. Please update your profile bank details first.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleWithdraw = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        amount: parsedAmount,
        method,
      };

      if (method === "bank" && bankDetails) {
        payload.account_number = bankDetails.bank_account_number;
        payload.ifsc_code = bankDetails.ifsc_code;
        payload.account_name = bankDetails.bank_holder_name;
      } else if (method === "upi" && bankDetails) {
        payload.upi_id = bankDetails.upi_id;
      }

      const res = await fetch("/api/worker/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Withdrawal request failed");
      }

      setReferenceId(json.data?.referenceId || "");
      setSuccess(true);
      toast.success("Withdrawal request submitted successfully!");
    } catch (err: any) {
      console.error("[Withdraw] Error:", err);
      toast.error(err.message || "Failed to submit withdrawal");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
        <p className="text-sm text-gray-500 font-medium">Loading withdrawal details...</p>
      </div>
    );
  }

  // ── Success Screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm max-w-sm w-full space-y-4">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} className="text-emerald-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900">Request Submitted!</h2>
          <p className="text-sm text-gray-500 font-medium leading-relaxed">
            Your withdrawal of{" "}
            <span className="font-black text-gray-900">₹{parsedAmount.toLocaleString("en-IN")}</span>{" "}
            via{" "}
            <span className="font-black text-gray-900">{method === "bank" ? "Bank Transfer" : "UPI"}</span>{" "}
            has been submitted.
          </p>

          {referenceId && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-center">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">Reference ID</p>
              <p className="text-xs font-black text-indigo-600 break-all">{referenceId}</p>
            </div>
          )}

          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-left">
            <Clock size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 font-semibold">
              Amount will be credited to your account within <strong>24 hours</strong> on business days.
            </p>
          </div>

          <button
            onClick={() => router.push("/partner/earnings")}
            className="w-full bg-indigo-600 text-white font-black text-sm py-4 rounded-2xl hover:bg-indigo-700 transition-colors"
          >
            Back to Wallet
          </button>
        </div>
      </div>
    );
  }

  // ── Withdraw Form ───────────────────────────────────────────────────────────
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
            <h1 className="text-base font-black text-gray-900">Withdraw Money</h1>
            <p className="text-xs text-gray-500">Transfer to your bank or UPI</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-5 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={14} className="text-gray-400" />
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Available Balance</p>
          </div>
          <p className="text-3xl font-black mt-1">
            ₹{balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="mt-3 flex items-center gap-2 text-gray-400 text-xs font-semibold">
            <Lock size={11} />
            <span>₹{MIN_WALLET_RESERVE} reserved · Max withdrawable: </span>
            <span className="text-emerald-400 font-black">
              ₹{maxWithdrawable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Amount Input */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
          <label className="block text-xs font-black text-gray-400 uppercase tracking-wider">
            Withdrawal Amount
          </label>

          <div className={`flex items-center gap-2 border-2 rounded-2xl px-4 py-4 transition-all ${
            errors.amount
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
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
                setAmount(cleaned);
                setErrors((prev) => ({ ...prev, amount: "" }));
              }}
              className="flex-1 text-3xl font-black text-gray-900 bg-transparent outline-none placeholder:text-gray-200"
            />
            <button
              onClick={handleMaxAmount}
              className="text-xs font-black text-indigo-500 hover:text-indigo-700 px-2 py-1 bg-indigo-50 rounded-lg transition-colors"
            >
              MAX
            </button>
          </div>

          {errors.amount && (
            <div className="flex items-center gap-1.5 text-red-500">
              <AlertCircle size={13} />
              <p className="text-xs font-semibold">{errors.amount}</p>
            </div>
          )}
          <p className="text-[10px] text-gray-400 font-medium">
            Min ₹{MIN_WITHDRAW} · ₹{MIN_WALLET_RESERVE} always stays in wallet
          </p>
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
          <label className="block text-xs font-black text-gray-400 uppercase tracking-wider">
            Transfer To
          </label>

          <div className="grid grid-cols-2 gap-3">
            {/* Bank Transfer */}
            <button
              type="button"
              onClick={() => { setMethod("bank"); setErrors((e) => ({ ...e, method: "" })); }}
              className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all ${
                method === "bank"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-100 bg-gray-50 hover:border-gray-200"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                method === "bank" ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500"
              }`}>
                <Building2 size={18} />
              </div>
              <div className="text-center">
                <p className={`text-xs font-black ${method === "bank" ? "text-indigo-700" : "text-gray-600"}`}>
                  Bank Transfer
                </p>
                <p className="text-[10px] text-gray-400 font-medium">NEFT/IMPS</p>
              </div>
            </button>

            {/* UPI */}
            <button
              type="button"
              onClick={() => { setMethod("upi"); setErrors((e) => ({ ...e, method: "" })); }}
              className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all ${
                method === "upi"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-100 bg-gray-50 hover:border-gray-200"
              }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                method === "upi" ? "bg-indigo-100 text-indigo-600" : "bg-gray-100 text-gray-500"
              }`}>
                <Smartphone size={18} />
              </div>
              <div className="text-center">
                <p className={`text-xs font-black ${method === "upi" ? "text-indigo-700" : "text-gray-600"}`}>
                  UPI
                </p>
                <p className="text-[10px] text-gray-400 font-medium">Instant</p>
              </div>
            </button>
          </div>

          {errors.method && (
            <div className="flex items-center gap-1.5 text-red-500">
              <AlertCircle size={13} />
              <p className="text-xs font-semibold">{errors.method}</p>
            </div>
          )}
        </div>

        {/* Selected Method Details */}
        {method === "bank" && bankDetails?.bank_account_number ? (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 size={12} className="text-indigo-500" />
              Bank Details (from your profile)
            </h3>
            <div className="space-y-2">
              {[
                { label: "Account Holder", value: bankDetails.bank_holder_name },
                { label: "Bank", value: bankDetails.bank_name },
                { label: "Account Number", value: `****${bankDetails.bank_account_number.slice(-4)}` },
                { label: "IFSC Code", value: bankDetails.ifsc_code },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500 font-semibold">{label}</span>
                  <span className="font-black text-gray-800">{value || "—"}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 pt-1 text-gray-400 border-t border-gray-50">
              <Info size={11} />
              <p className="text-[10px] font-medium">
                To change bank details, go to{" "}
                <button
                  onClick={() => router.push("/partner/profile/bank-details")}
                  className="text-indigo-500 font-bold hover:underline"
                >
                  Profile → Bank Details
                </button>
              </p>
            </div>
          </div>
        ) : method === "upi" && bankDetails?.upi_id ? (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <Smartphone size={12} className="text-indigo-500" />
              UPI Details (from your profile)
            </h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 font-semibold">UPI ID</span>
              <span className="font-black text-gray-800">{bankDetails.upi_id}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-3 text-gray-400 border-t border-gray-50 pt-3">
              <Info size={11} />
              <p className="text-[10px] font-medium">
                To change UPI ID, go to{" "}
                <button
                  onClick={() => router.push("/partner/profile/bank-details")}
                  className="text-indigo-500 font-bold hover:underline"
                >
                  Profile → Bank Details
                </button>
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">Payment details not set</p>
              <p className="text-xs text-amber-600 font-medium mt-0.5">
                Please add your {method === "bank" ? "bank account" : "UPI ID"} in Profile → Bank Details before withdrawing.
              </p>
              <button
                onClick={() => router.push("/partner/profile/bank-details")}
                className="mt-2 text-xs font-black text-indigo-600 hover:text-indigo-800 underline"
              >
                Go to Bank Details →
              </button>
            </div>
          </div>
        )}

        {/* Summary */}
        {parsedAmount >= MIN_WITHDRAW && parsedAmount <= maxWithdrawable && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 font-semibold">Withdrawal Amount</span>
              <span className="font-black text-gray-900">₹{parsedAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 font-semibold">Transfer Method</span>
              <span className="font-black text-gray-800">{method === "bank" ? "Bank Transfer (NEFT/IMPS)" : "UPI Transfer"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 font-semibold">Processing Time</span>
              <span className="font-black text-amber-600">Within 24 hours</span>
            </div>
            <div className="border-t border-indigo-200 pt-2 flex justify-between text-sm">
              <span className="font-black text-gray-800">Balance After</span>
              <span className="font-black text-gray-900">
                ₹{(balance - parsedAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleWithdraw}
          disabled={submitting || parsedAmount < MIN_WITHDRAW || parsedAmount > maxWithdrawable || balance <= MIN_WALLET_RESERVE}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 active:scale-[0.98] text-white font-black text-sm py-4 rounded-2xl shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin w-4 h-4" />
              Submitting request...
            </>
          ) : (
            <>
              <ArrowUpRight size={18} />
              Withdraw ₹{parsedAmount > 0 ? parsedAmount.toLocaleString("en-IN") : "—"}
            </>
          )}
        </button>

        {balance <= MIN_WALLET_RESERVE && (
          <div className="flex items-center gap-2 justify-center text-amber-600">
            <AlertCircle size={14} />
            <p className="text-xs font-bold">
              Your balance is at or below the ₹{MIN_WALLET_RESERVE} minimum reserve. Add money first.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 font-medium">
          🔒 Withdrawals are processed securely. Contact support@zolvo.in for disputes.
        </p>
      </div>
    </div>
  );
}
