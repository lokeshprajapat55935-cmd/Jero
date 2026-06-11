"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/providers/UserProvider";
import { createClient } from "@/lib/supabase/client";
import { Clock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function WorkerApplicationUnderReview() {
  const { profile, loading: authLoading } = useUser();
  const router = useRouter();
  const [partner, setPartner] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      if (authLoading) return;
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      // Defensive check: if role is client, send them away immediately
      if (profile.role !== 'worker') {
        console.log("Redirecting customer away from worker under-review page", { role: profile.role });
        router.replace('/dashboard');
        return;
      }

      try {
        const supabase = createClient();
        const { data: partnerData, error: partnerErr } = await supabase
          .from('partners')
          .select('*')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (partnerErr) {
          console.error("Error fetching partner status on under-review page:", partnerErr);
        }

        if (!partnerData || !partnerData.current_step || partnerData.current_step < 6) {
          console.log("No completed partner record found, redirecting to onboarding...");
          router.replace('/partner/onboarding');
          return;
        }

        setPartner(partnerData);

        // Redirect to dashboard if approved
        if (partnerData.status === 'approved') {
          console.log("Partner approved! Redirecting to worker dashboard.");
          router.replace('/partner/dashboard');
        } else if (partnerData.status === 'rejected') {
          console.log("Partner rejected! Redirecting to rejected page.");
          router.replace('/partner/rejected');
        }
      } catch (err) {
        console.error("Exception in worker under-review page:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [profile, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-indigo-600 h-10 w-10" />
      </div>
    );
  }

  const statusDisplay = partner?.status || 'pending';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-gray-100">
        <div className="mx-auto w-20 h-20 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
          <Clock size={40} className="animate-pulse" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Application Under Review</h1>
        <p className="text-gray-500 font-medium leading-relaxed mb-6">
          Thank you for applying to be a Zolvo Partner! Our team is currently reviewing your documents and profile. 
          This usually takes 24-48 hours.
        </p>
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm font-semibold text-gray-600">
          Status: <span className="text-indigo-600 uppercase tracking-widest">{statusDisplay.replace('_', ' ')}</span>
        </div>
      </div>
    </div>
  );
}
