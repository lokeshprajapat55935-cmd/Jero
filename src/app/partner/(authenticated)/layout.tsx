"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "@/providers/UserProvider";
import { createClient } from "@/lib/supabase/client";
import { PartnerBottomNav } from "@/components/navigation/PartnerBottomNav";

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading: authLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [partnerStatus, setPartnerStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPartnerStatus = async () => {
      // Don't run query until authentication is resolved
      if (authLoading) return;

      if (!profile?.id) {
        setLoading(false);
        return;
      }

      // Defensive check: if customer, redirect to customer dashboard
      if (profile.role !== 'worker') {
        console.log('[Layout] Defensive Check: Redirecting customer away from worker layout', { role: profile.role });
        router.replace('/dashboard');
        return;
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('partners')
          .select('status, current_step, bank_holder_name')
          .eq('profile_id', profile.id)
          .maybeSingle();

        if (error) {
          console.error('[Layout] Error fetching partner status:', error);
        }

        const status = data?.status || 'pending';
        const currentStep = data?.current_step || 1;
        const payoutComplete = !!data?.bank_holder_name;
        setPartnerStatus(status);

        console.log('[Layout] Partner guard check:', {
          profile_onboarded: profile.onboarded,
          profile_role: profile.role,
          partner_status: status,
          partner_current_step: currentStep,
          partner_payout_complete: payoutComplete,
          pathname,
        });

        // Check if onboarding is incomplete
        const onboardingIncomplete = !profile.onboarded || !data || currentStep < 6;

        if (onboardingIncomplete) {
          if (pathname !== '/partner/onboarding') {
            console.log('[Layout] Redirect reason: onboarding incomplete | onboarded:', profile.onboarded, '| step:', currentStep, ' → /partner/onboarding');
            router.replace('/partner/onboarding');
          }
          return;
        }

        // Routing restrictions
        if (status === 'pending' || status === 'under_review') {
          if (pathname !== '/partner/application-under-review' && pathname !== '/worker/application-under-review') {
            console.log('[Layout] Redirect reason: status=', status, ' → /partner/application-under-review');
            router.replace('/partner/application-under-review');
          }
        } else if (status === 'rejected') {
          if (pathname !== '/partner/rejected') {
            console.log('[Layout] Redirect reason: status=rejected → /partner/rejected');
            router.replace('/partner/rejected');
          }
        } else if (status !== 'approved') {
          // suspended, restrict to worker dashboard lock screens
          if (pathname !== '/partner/dashboard' && pathname !== '/worker/dashboard') {
            console.log('[Layout] Redirect reason: status=', status, '(suspended) → /partner/dashboard');
            router.replace('/partner/dashboard');
          }
        } else {
          // status === 'approved'
          // Only redirect approved workers away from onboarding/under-review/rejected if payout is COMPLETE.
          // If payout is missing, allow them to stay on /partner/onboarding to fill step 6.
          if (
            pathname === '/partner/application-under-review' || 
            pathname === '/worker/application-under-review' ||
            pathname === '/partner/rejected'
          ) {
            console.log('[Layout] Redirect reason: approved worker on review/rejected page → /partner/dashboard');
            router.replace('/partner/dashboard');
          } else if (pathname === '/partner/onboarding' && payoutComplete) {
            // Only redirect away from onboarding if payout is already done
            console.log('[Layout] Redirect reason: approved worker + payout complete on onboarding page → /partner/dashboard');
            router.replace('/partner/dashboard');
          } else if (pathname === '/partner/onboarding' && !payoutComplete) {
            // Approved but payout missing — allow onboarding to render step 6
            console.log('[Layout] Approved worker with missing payout on /partner/onboarding — allowing step 6 to render.');
          }
        }
      } catch (err) {
        console.error('[Layout] Exception checking partner status:', err);
      } finally {
        setLoading(false);
      }
    };

    checkPartnerStatus();
  }, [profile, authLoading, pathname, router]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isApproved = partnerStatus === 'approved';

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto bg-white shadow-xl min-h-screen">
        {children}
      </main>

      {/* Persistent Bottom Navigation - Only render for approved partners */}
      {isApproved && <PartnerBottomNav />}
    </div>
  );
}

