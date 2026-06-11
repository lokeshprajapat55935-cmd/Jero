"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  CreditCard,
  Building2,
  Hash,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";

interface BankForm {
  bank_holder_name: string;
  bank_name: string;
  bank_account_number: string;
  ifsc_code: string;
  upi_id: string;
}

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export default function BankDetailsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [errors, setErrors] = useState<Partial<BankForm>>({});
  const [form, setForm] = useState<BankForm>({
    bank_holder_name: "",
    bank_name: "",
    bank_account_number: "",
    ifsc_code: "",
    upi_id: "",
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/worker/profile/bank-details");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load bank details");
        setForm({
          bank_holder_name: json.data.bank_holder_name || "",
          bank_name: json.data.bank_name || "",
          bank_account_number: json.data.bank_account_number || "",
          ifsc_code: json.data.ifsc_code || "",
          upi_id: json.data.upi_id || "",
        });
      } catch (err: any) {
        console.error("[BankDetails] Load error:", err);
        toast.error(err.message || "Failed to load bank details");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const validate = (): boolean => {
    const newErrors: Partial<BankForm> = {};

    if (!form.bank_holder_name.trim()) newErrors.bank_holder_name = "Account holder name is required";
    if (!form.bank_name.trim()) newErrors.bank_name = "Bank name is required";
    if (!form.bank_account_number.trim()) {
      newErrors.bank_account_number = "Account number is required";
    } else if (!/^\d{9,18}$/.test(form.bank_account_number)) {
      newErrors.bank_account_number = "Account number must be 9–18 digits";
    }
    if (!form.ifsc_code.trim()) {
      newErrors.ifsc_code = "IFSC code is required";
    } else if (!IFSC_REGEX.test(form.ifsc_code.toUpperCase())) {
      newErrors.ifsc_code = "Invalid IFSC format (e.g. HDFC0001234)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the errors before saving");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/worker/profile/bank-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ifsc_code: form.ifsc_code.toUpperCase(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Show field-level errors if available
        if (json.details) {
          const fieldErrors: Partial<BankForm> = {};
          Object.entries(json.details).forEach(([key, val]) => {
            fieldErrors[key as keyof BankForm] = Array.isArray(val) ? val[0] : String(val);
          });
          setErrors(fieldErrors);
          toast.error("Please fix the validation errors");
          return;
        }
        throw new Error(json.error || "Failed to save");
      }
      toast.success("Bank details saved successfully!");
    } catch (err: any) {
      console.error("[BankDetails] Save error:", err);
      toast.error(err.message || "Failed to save bank details");
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (key: keyof BankForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
        <p className="text-sm text-gray-500 font-medium">Loading bank details...</p>
      </div>
    );
  }

  const hasExistingDetails = !!form.bank_account_number;

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
            <h1 className="text-base font-black text-gray-900">Bank Account Details</h1>
            <p className="text-xs text-gray-500">Payout & withdrawal information</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Status Banner */}
        {hasExistingDetails ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl border bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Bank details saved — you can update anytime
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl border bg-amber-50 text-amber-700 border-amber-200 font-semibold text-sm">
            <AlertCircle className="w-4 h-4" />
            Please add your bank details to receive payouts
          </div>
        )}

        {/* Bank Form */}
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <CreditCard className="w-4 h-4 text-indigo-500" />
            Bank Information
          </h2>

          {/* Account Holder Name */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Account Holder Name *
            </label>
            <input
              type="text"
              placeholder="As per bank records"
              value={form.bank_holder_name}
              onChange={(e) => updateForm("bank_holder_name", e.target.value)}
              className={`w-full rounded-xl border bg-gray-50 focus:bg-white px-4 py-3 text-sm font-semibold text-gray-700 outline-none transition-all focus:ring-1 ${
                errors.bank_holder_name
                  ? "border-red-300 focus:border-red-400 focus:ring-red-300"
                  : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-300"
              }`}
            />
            {errors.bank_holder_name && (
              <p className="text-xs text-red-500 mt-1 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.bank_holder_name}
              </p>
            )}
          </div>

          {/* Bank Name */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Bank Name *
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="e.g. HDFC Bank, SBI, Axis Bank"
                value={form.bank_name}
                onChange={(e) => updateForm("bank_name", e.target.value)}
                className={`w-full rounded-xl border bg-gray-50 focus:bg-white pl-10 pr-4 py-3 text-sm font-semibold text-gray-700 outline-none transition-all focus:ring-1 ${
                  errors.bank_name
                    ? "border-red-300 focus:border-red-400 focus:ring-red-300"
                    : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-300"
                }`}
              />
            </div>
            {errors.bank_name && (
              <p className="text-xs text-red-500 mt-1 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.bank_name}
              </p>
            )}
          </div>

          {/* Account Number */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Account Number *
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showAccountNumber ? "text" : "password"}
                placeholder="9–18 digit account number"
                value={form.bank_account_number}
                onChange={(e) => updateForm("bank_account_number", e.target.value.replace(/\D/g, ""))}
                className={`w-full rounded-xl border bg-gray-50 focus:bg-white pl-10 pr-12 py-3 text-sm font-semibold text-gray-700 outline-none transition-all focus:ring-1 ${
                  errors.bank_account_number
                    ? "border-red-300 focus:border-red-400 focus:ring-red-300"
                    : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-300"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowAccountNumber(!showAccountNumber)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showAccountNumber ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.bank_account_number && (
              <p className="text-xs text-red-500 mt-1 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.bank_account_number}
              </p>
            )}
          </div>

          {/* IFSC Code */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              IFSC Code *
            </label>
            <input
              type="text"
              placeholder="e.g. HDFC0001234"
              value={form.ifsc_code}
              onChange={(e) => updateForm("ifsc_code", e.target.value.toUpperCase())}
              maxLength={11}
              className={`w-full rounded-xl border bg-gray-50 focus:bg-white px-4 py-3 text-sm font-bold uppercase text-gray-700 tracking-widest outline-none transition-all focus:ring-1 ${
                errors.ifsc_code
                  ? "border-red-300 focus:border-red-400 focus:ring-red-300"
                  : "border-gray-200 focus:border-indigo-400 focus:ring-indigo-300"
              }`}
            />
            {errors.ifsc_code ? (
              <p className="text-xs text-red-500 mt-1 font-medium flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.ifsc_code}
              </p>
            ) : (
              <p className="text-[10px] text-gray-400 mt-1 font-medium">
                Format: 4 letters + 0 + 6 alphanumeric (e.g. HDFC0001234)
              </p>
            )}
          </div>

          {/* UPI ID — Optional */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              UPI ID <span className="text-gray-400 normal-case font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="mobilenumber@upi"
                value={form.upi_id}
                onChange={(e) => updateForm("upi_id", e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 pl-10 pr-4 py-3 text-sm font-semibold text-gray-700 outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black text-sm py-4 rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? "Saving..." : hasExistingDetails ? "Update Bank Details" : "Save Bank Details"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 font-medium px-4">
          🔒 Your bank details are encrypted and stored securely. Only used for payouts.
        </p>
      </div>
    </div>
  );
}
