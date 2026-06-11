"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/providers/UserProvider";
import { createClient } from "@/lib/supabase/client";
import { Ban, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function WorkerApplicationRejected() {
  const { profile, loading: authLoading } = useUser();
  const router = useRouter();
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
        console.log("Redirecting customer away from worker rejected page", { role: profile.role });
        router.replace('/dashboard');
        return;
      }

      try {
        const supabase = createClient();
        const { data: partnerData, error: partnerErr } = await supabase
          .from('partners')
          .select('status, current_step')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (partnerErr) {
          console.error("Error fetching partner status on rejected page:", partnerErr);
        }

        if (!partnerData || !partnerData.current_step || partnerData.current_step < 6) {
          console.log("Onboarding incomplete, redirecting to onboarding...");
          router.replace('/partner/onboarding');
          return;
        }

        if (partnerData.status === 'approved') {
          console.log("Partner approved, redirecting to dashboard");
          router.replace('/partner/dashboard');
          return;
        }

        if (partnerData.status === 'pending' || partnerData.status === 'under_review') {
          console.log("Partner pending, redirecting to under-review page");
          router.replace('/partner/application-under-review');
          return;
        }
      } catch (err) {
        console.error("Exception in worker rejected page:", err);
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-gray-100">
        <div className="mx-auto w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
          <Ban size={40} />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Application Rejected</h1>
        <p className="text-gray-500 font-medium leading-relaxed mb-6">
          Unfortunately, we could not approve your application at this time based on our quality guidelines.
        </p>
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 text-sm font-semibold text-gray-600">
          Contact support for more details.
        </div>
      </div>
    </div>
  );
}
