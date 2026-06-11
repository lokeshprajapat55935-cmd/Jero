"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  ArrowLeft,
  ShieldCheck,
  FileText,
  Eye,
  Lock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  UploadCloud,
} from "lucide-react";

interface IdentityData {
  full_name: string;
  phone: string;
  aadhaar_number: string;
  pan_number: string;
  id_proof_type: string;
  id_proof_url: string;
  kyc_status: string;
  is_approved: boolean;
}

const KYC_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  approved: {
    label: "KYC Verified",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  under_review: {
    label: "Under Review",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <AlertCircle className="w-4 h-4" />,
  },
  pending: {
    label: "Pending Verification",
    color: "bg-gray-50 text-gray-600 border-gray-200",
    icon: <AlertCircle className="w-4 h-4" />,
  },
  rejected: {
    label: "Verification Failed",
    color: "bg-red-50 text-red-700 border-red-200",
    icon: <AlertCircle className="w-4 h-4" />,
  },
};

export default function IdentityDocumentsPage() {
  const router = useRouter();
  const [data, setData] = useState<IdentityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    aadhaar_number: "",
    pan_number: "",
    id_proof_type: "Aadhaar",
    id_proof_url: "",
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/worker/profile/identity");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load identity data");
        setData(json.data);
        setForm({
          aadhaar_number: json.data.aadhaar_number || "",
          pan_number: json.data.pan_number || "",
          id_proof_type: json.data.id_proof_type || "Aadhaar",
          id_proof_url: json.data.id_proof_url || "",
        });
      } catch (err: any) {
        console.error("[Identity] Load error:", err);
        toast.error(err.message || "Failed to load identity data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size cannot exceed 5MB.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid format. Please upload JPG, PNG, WEBP or PDF.");
      return;
    }

    setUploading(true);
    try {
      const uploadData = new FormData();
      uploadData.append("file", file);
      uploadData.append("type", "id_proof");

      const res = await fetch("/api/worker/upload", { method: "POST", body: uploadData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Upload failed");

      setForm((prev) => ({ ...prev, id_proof_url: json.data.url }));
      toast.success("Document uploaded successfully!");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (data?.is_approved) return;

    setSaving(true);
    try {
      const res = await fetch("/api/worker/profile/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save");
      toast.success("Identity details updated successfully!");
    } catch (err: any) {
      console.error("[Identity] Save error:", err);
      toast.error(err.message || "Failed to save identity details");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
        <p className="text-sm text-gray-500 font-medium">Loading identity details...</p>
      </div>
    );
  }

  const statusConfig = KYC_STATUS_CONFIG[data?.kyc_status || "pending"];
  const isApproved = data?.is_approved;

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
            <h1 className="text-base font-black text-gray-900">Identity & Documents</h1>
            <p className="text-xs text-gray-500">KYC verification details</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* KYC Status Badge */}
        <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border font-semibold text-sm ${statusConfig.color}`}>
          {statusConfig.icon}
          <span>{statusConfig.label}</span>
          {isApproved && (
            <span className="ml-auto text-xs text-emerald-600 font-bold">Documents locked — verified</span>
          )}
        </div>

        {isApproved && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-start gap-3">
            <Lock className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-indigo-700 font-medium">
              Your documents are verified and locked. Contact support to make changes.
            </p>
          </div>
        )}

        {/* Personal Info — Always read-only */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            Personal Information
          </h2>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Full Name</label>
            <div className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
              {data?.full_name || "—"}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Mobile Number <span className="text-gray-400 normal-case font-normal">(read-only)</span>
            </label>
            <div className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-gray-400" />
              {data?.phone || "—"}
            </div>
          </div>
        </div>

        {/* KYC Documents */}
        <form onSubmit={handleSave} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-indigo-500" />
            KYC Documents
          </h2>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">ID Proof Type</label>
            {isApproved ? (
              <div className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
                {form.id_proof_type}
              </div>
            ) : (
              <select
                value={form.id_proof_type}
                onChange={(e) => setForm((p) => ({ ...p, id_proof_type: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 px-4 py-3 text-sm font-semibold text-gray-700 outline-none transition-all"
              >
                <option value="Aadhaar">Aadhaar Card</option>
                <option value="PAN">PAN Card</option>
                <option value="Voter ID">Voter ID</option>
                <option value="Driving License">Driving License</option>
              </select>
            )}
          </div>

          {(form.id_proof_type === "Aadhaar" || !isApproved) && form.id_proof_type === "Aadhaar" && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Aadhaar Number</label>
              {isApproved ? (
                <div className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  {form.aadhaar_number
                    ? form.aadhaar_number.replace(/(\d{4})(\d{4})(\d{4})/, "XXXX XXXX $3")
                    : "—"}
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="1234 5678 9012"
                  value={form.aadhaar_number}
                  onChange={(e) => setForm((p) => ({ ...p, aadhaar_number: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 px-4 py-3 text-sm font-semibold text-gray-700 outline-none transition-all"
                />
              )}
            </div>
          )}

          {form.id_proof_type === "PAN" && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">PAN Card Number</label>
              {isApproved ? (
                <div className="w-full rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  {form.pan_number ? form.pan_number.replace(/(.{5})(.{4})/, "XXXXX$2") : "—"}
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="ABCDE1234F"
                  value={form.pan_number}
                  onChange={(e) => setForm((p) => ({ ...p, pan_number: e.target.value.toUpperCase() }))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 px-4 py-3 text-sm font-semibold text-gray-700 uppercase outline-none transition-all"
                />
              )}
            </div>
          )}

          {/* Uploaded Document */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Uploaded Document
            </label>
            {form.id_proof_url ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-emerald-700">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs font-bold">Document uploaded</span>
                </div>
                <a
                  href={form.id_proof_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-4 text-center">
                <p className="text-xs text-gray-400 font-semibold">No document uploaded</p>
              </div>
            )}

            {!isApproved && (
              <label className="mt-2 cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-lg shadow-sm transition-all">
                {uploading ? (
                  <Loader2 className="animate-spin h-3.5 w-3.5" />
                ) : (
                  <UploadCloud size={14} />
                )}
                {form.id_proof_url ? "Replace Document" : "Upload Document"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            )}
          </div>

          {!isApproved && (
            <button
              type="submit"
              disabled={saving}
              className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-black text-sm py-4 rounded-2xl shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="animate-spin w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {saving ? "Saving..." : "Save Identity Details"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
