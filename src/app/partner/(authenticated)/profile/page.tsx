"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@/providers/UserProvider";
import { reviewService } from "@/services/review";
import type { Review } from "@/types";
import {
  LogOut,
  ChevronRight,
  Settings,
  FileText,
  CreditCard,
  ShieldCheck,
  Star,
  Award,
  TrendingUp,
  Users,
  Loader2,
  Copy,
  Check,
  BadgeCheck,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

export default function PartnerProfilePage() {
  const { profile, logout } = useUser();
  const router = useRouter();

  const [workerDetails, setWorkerDetails] = useState<any>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [partnerDisplayId, setPartnerDisplayId] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      console.log("[Profile] Initiating logout...");

      // Clear all local storage related to Zolvo
      if (typeof window !== "undefined") {
        localStorage.removeItem("zolvo-cached-user");
        localStorage.removeItem("zolvo-cached-profile");
      }

      // Use UserProvider logout — clears Firebase, Supabase, and redirects
      await logout();
      console.log("[Profile] Logout successful");
    } catch (e: any) {
      console.error("[Profile] Logout error:", e);
      toast.error(e.message || "Logout failed");
      setLoggingOut(false);
    }
  };

  const handleCopyPartnerId = async () => {
    if (!partnerDisplayId) return;
    try {
      await navigator.clipboard.writeText(partnerDisplayId);
      setIdCopied(true);
      toast.success("Partner ID copied!");
      setTimeout(() => setIdCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        // Load worker profile
        const profileRes = await fetch("/api/worker/profile");
        const profileJson = await profileRes.json();
        if (profileJson.success && profileJson.data) {
          setWorkerDetails(profileJson.data);
          console.log("[Profile] Worker details loaded:", profileJson.data.id);

          // Load worker reviews
          const reviewsRes = await reviewService.getWorkerReviews(profileJson.data.id);
          if (reviewsRes.data) {
            setReviews(reviewsRes.data);
          }
        }
      } catch (err) {
        console.error("[Profile] Failed to load worker details and reviews", err);
      }

      // Load Partner Display ID separately (non-blocking)
      try {
        const idRes = await fetch("/api/worker/profile/partner-id");
        const idJson = await idRes.json();
        if (idRes.ok && idJson.data?.partner_display_id) {
          setPartnerDisplayId(idJson.data.partner_display_id);
          console.log("[Profile] Partner ID loaded:", idJson.data.partner_display_id);
        } else {
          console.warn("[Profile] Could not load partner ID:", idJson.error);
        }
      } catch (err) {
        console.error("[Profile] Failed to load partner ID:", err);
      }

      setLoading(false);
    }
    loadData();
  }, []);

  const menuItems = [
    {
      icon: ShieldCheck,
      label: "Identity & Documents",
      description: "KYC details and uploaded documents",
      route: "/partner/profile/identity",
      color: "bg-blue-50 text-blue-600",
    },
    {
      icon: CreditCard,
      label: "Bank Account Details",
      description: "Payout and withdrawal information",
      route: "/partner/profile/bank-details",
      color: "bg-emerald-50 text-emerald-600",
    },
    {
      icon: FileText,
      label: "Terms & Policies",
      description: "Partner terms, privacy and refund policy",
      route: "/partner/profile/terms",
      color: "bg-amber-50 text-amber-600",
    },
    {
      icon: Settings,
      label: "App Settings",
      description: "Language, notifications and display",
      route: "/partner/profile/app-settings",
      color: "bg-purple-50 text-purple-600",
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
        <p className="text-sm text-gray-500 font-medium">Loading profile statistics...</p>
      </div>
    );
  }

  // Calculate rating breakdown
  const totalReviewsCount = reviews.length;
  const breakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((r) => {
    const star = Math.round(Number(r.rating));
    if (star >= 1 && star <= 5) {
      breakdown[star] += 1;
    }
  });

  return (
    <div className="p-4 sm:p-6 pb-24 bg-gray-50 min-h-screen max-w-2xl mx-auto flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Partner Profile</h1>
        <p className="text-xs text-gray-500 mt-0.5">Manage your details, performance, and feedback logs.</p>
      </div>

      {/* User Info Card */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100/80 flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-full flex items-center justify-center font-black text-xl shadow-sm shadow-indigo-500/20">
          {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : "P"}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">{profile?.full_name || "Zolvo Partner"}</h2>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-0.5">
            {workerDetails?.category || "Service Professional"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{profile?.phone || "+91 XXXXX XXXXX"}</p>
        </div>
        {workerDetails?.status === "approved" && (
          <div className="flex-shrink-0">
            <BadgeCheck className="w-6 h-6 text-emerald-500" />
          </div>
        )}
      </div>

      {/* Partner App ID Card */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-3xl p-5 shadow-lg shadow-indigo-500/20">
        <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1">Partner App ID</p>
        {partnerDisplayId ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-white font-black text-xl tracking-wider">{partnerDisplayId}</span>
            <button
              onClick={handleCopyPartnerId}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 active:bg-white/40 text-white text-xs font-bold px-3 py-2 rounded-xl transition-all"
            >
              {idCopied ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
              {idCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-indigo-300 animate-spin" />
            <span className="text-indigo-200 text-sm font-semibold">Generating ID...</span>
          </div>
        )}
        <p className="text-indigo-300 text-[10px] font-medium mt-2">
          Use this ID when contacting support. It never changes.
        </p>
      </div>

      {/* Ratings & Performance Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Average Rating Block */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-amber-500">
            <Star className="w-4 h-4 fill-amber-500" />
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Rating Avg</span>
          </div>
          <div className="my-2.5">
            <span className="text-3xl font-black text-gray-900">
              {Number(workerDetails?.rating_avg || 0).toFixed(1)}
            </span>
            <span className="text-xs text-gray-400 font-bold ml-1">/ 5.0</span>
          </div>
          <p className="text-[10px] text-gray-500 font-medium">
            From {workerDetails?.review_count || 0} reviews
          </p>
        </div>

        {/* Worker Rank Block */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-indigo-600">
            <Award className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Category Rank</span>
          </div>
          <div className="my-2.5">
            <span className="text-3xl font-black text-gray-900">
              {workerDetails?.ranking?.category_rank ? `#${workerDetails.ranking.category_rank}` : "—"}
            </span>
          </div>
          <p className="text-[10px] text-gray-500 font-medium">
            Overall Rank:{" "}
            {workerDetails?.ranking?.overall_rank ? `#${workerDetails.ranking.overall_rank}` : "—"}
          </p>
        </div>
      </div>

      {/* Analytics Comparisons */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100/80 shadow-sm space-y-3.5">
        <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          Analytics Insights
        </h3>
        <div className="grid grid-cols-2 gap-4 divide-x divide-gray-100">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">Category Avg</p>
            <p className="text-base font-bold text-gray-800 mt-0.5">
              ⭐ {Number(workerDetails?.category_average_rating || 0).toFixed(1)}
            </p>
          </div>
          <div className="pl-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase">Status comparison</p>
            <p className="text-xs font-bold text-emerald-600 mt-1 flex items-center gap-1">
              {Number(workerDetails?.rating_avg || 0) >=
              Number(workerDetails?.category_average_rating || 0)
                ? "✓ Above Average"
                : "ℹ Below Average"}
            </p>
          </div>
        </div>
      </div>

      {/* Rating Breakdown */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100/80 shadow-sm space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">Rating Breakdown</h3>
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = breakdown[stars] || 0;
            const percentage = totalReviewsCount > 0 ? (count / totalReviewsCount) * 100 : 0;
            return (
              <div key={stars} className="flex items-center gap-3 text-xs">
                <span className="w-4 font-bold text-gray-500 text-right">{stars}★</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="w-8 text-right text-gray-400 font-semibold">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Reviews */}
      <div className="bg-white rounded-3xl p-5 border border-gray-100/80 shadow-sm flex flex-col gap-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-indigo-500" />
          Recent Customer Reviews
        </h3>

        {reviews.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-gray-100 rounded-2xl">
            <Star className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-xs text-gray-400 font-bold">No reviews received yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 space-y-4">
            {reviews.slice(0, 5).map((r, i) => (
              <div key={r.id} className={`pt-4 ${i === 0 ? "pt-0" : ""}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-50 rounded-full flex items-center justify-center font-bold text-xs text-indigo-600">
                      {r.reviewer?.full_name ? r.reviewer.full_name.charAt(0).toUpperCase() : "C"}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900">{r.reviewer?.full_name || "Customer"}</p>
                      <p className="text-[10px] text-gray-400 font-semibold">
                        {new Date(r.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                    <span className="text-[10px] font-black text-amber-700">
                      {Number(r.rating).toFixed(1)}
                    </span>
                  </div>
                </div>

                {r.tags && r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[9px] font-bold bg-gray-50 border border-gray-100 text-gray-500 px-2 py-0.5 rounded-full"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {r.review_text && (
                  <p className="text-xs text-gray-600 leading-relaxed bg-gray-50/50 p-2.5 rounded-xl border border-gray-100/50">
                    &quot;{r.review_text}&quot;
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu Options */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {menuItems.map((item, i) => (
          <button
            key={i}
            onClick={() => {
              console.log(`[Profile] Navigating to ${item.route}`);
              router.push(item.route);
            }}
            className="w-full flex items-center justify-between p-5 border-b border-gray-50 active:bg-gray-50 hover:bg-gray-50/60 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center`}>
                <item.icon size={20} />
              </div>
              <div>
                <span className="font-bold text-gray-700 text-sm block">{item.label}</span>
                <span className="text-[10px] text-gray-400 font-medium">{item.description}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ChevronRight size={18} className="text-gray-300" />
            </div>
          </button>
        ))}
      </div>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full bg-white rounded-3xl p-5 border border-red-100 shadow-sm flex items-center justify-between text-red-600 active:bg-red-50 hover:bg-red-50/50 transition-colors disabled:opacity-70"
      >
        <div className="flex items-center gap-4 font-bold text-sm">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
            {loggingOut ? <Loader2 size={20} className="animate-spin" /> : <LogOut size={20} />}
          </div>
          {loggingOut ? "Signing out..." : "Log Out"}
        </div>
      </button>
    </div>
  );
}
