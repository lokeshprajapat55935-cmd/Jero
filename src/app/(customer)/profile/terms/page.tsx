'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Scale, ShieldAlert, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TermsPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-screen bg-gray-100/60 pb-20 md:pb-0">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()}
          className="shrink-0 -ml-2 text-gray-500 hover:text-gray-900 rounded-full h-10 w-10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Terms of Service</h1>
      </div>

      {/* Content */}
      <div className="w-full max-w-2xl mx-auto p-4 flex flex-col gap-6 mt-2">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6 text-sm text-gray-600 leading-relaxed">
          <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
            <div className="bg-amber-50 text-amber-700 p-2.5 rounded-lg shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">Zolvo Terms of Service</h2>
              <p className="text-xs text-gray-500">Last Updated: June 7, 2026 | Version 1.9</p>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Welcome to Zolvo. By accessing, downloading, or using the Zolvo platform (web services, dynamic applications, and native Android packages), you agree to comply with and be bound by the following Terms & Conditions. Please read these terms carefully. If you do not agree to these terms, you must not use or access our Platform.
          </p>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">1. Contractual Relationship</h3>
            <p>
              These Terms constitute a legally binding agreement between you (the &quot;User&quot;, &quot;Client&quot;, or &quot;Service Provider&quot;) and Zolvo Technologies. Zolvo operates as an intermediary technology aggregator. We facilitate connections between individual consumers seeking household repairs and independent, verified freelance service professionals (such as plumbers and electricians). Zolvo does not directly employ service professionals, nor do we provide the actual plumbing or electrical repairs.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">2. Scope of Services & Geographical Limits</h3>
            <p>
              Our Platform is geofenced to operate exclusively within the municipal boundaries of Bhilwara, Rajasthan, India.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs">
              <li><strong>Geofenced Matching:</strong> Service bookings cannot be dispatched or assigned outside active zones. Attempting to spoof GPS coordinates or place bookings in unauthorized areas will result in transaction cancellation and profile flags.</li>
              <li><strong>Platform Fees:</strong> We operate under a commission model. For cash transactions, workers are charged a platform commission fee (default 10%) automatically deducted from their worker wallet balance upon completion.</li>
              <li><strong>Minimum Wallet Balance:</strong> Service providers must maintain a minimum threshold balance of ₹500 in their worker wallet and keep their status toggle as &quot;Active&quot; to receive booking dispatch alerts.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">3. Verification & Safety Auditing</h3>
            <div className="flex gap-3">
              <Award className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <p className="text-xs">
                To guarantee the safety of our customers, all independent service professionals are subject to database onboarding vetting, which includes Aadhaar and Police Clearance check verifications. However, clients are advised to exercise reasonable caution and check credentials before admitting technicians into their premises.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">4. Security Restrictions & Anti-Fraud Auditing</h3>
            <div className="bg-red-50/50 p-4 rounded-xl border border-red-100 text-xs flex gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-950 mb-1">Strict Abuse & Suspensions Policy</p>
                <p className="text-red-700 leading-normal mb-2">
                  Zolvo incorporates automated safety thresholds to protect the integrity of the marketplace:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-red-700 leading-normal">
                  <li><strong>OTP Lockout:</strong> Booking completions require OTP validation. Multiple failed attempts (exceeding 5) will trigger a security lock and route the booking to a dispute log.</li>
                  <li><strong>GPS Spoofing Check:</strong> Location updates are cross-referenced with local cells. Utilizing GPS emulator apps or spoofing locations to simulate proximity will lead to immediate worker account suspension.</li>
                  <li><strong>Excessive Cancellations:</strong> Service providers who cancel more than 5 bookings within any rolling 7-day period will have their dispatch dispatch eligibility disabled.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">5. Bookings, Cancellations, and Disputes</h3>
            <p>
              Users are expected to pay the independent service professional immediately upon work completion using Cash or direct UPI transfer. If you cancel a booking after a provider has been dispatched, a nominal cancellation fee may be applied to your account. All service-level complaints, repair disputes, or billing questions must be reported through our support portal or by calling our customer helpline at 7014868682 within 24 hours of the service completion.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">6. Account Termination</h3>
            <p>
              We reserve the right, at our sole discretion, to terminate or restrict your access to the Platform at any time, without notice, for any violation of these Terms, including but not limited to fraudulent OTP guessing, profile sharing, harassment of users, non-payment, or wallet commission circumvention.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">7. Limitation of Liability</h3>
            <p>
              Zolvo shall not be liable for any direct, indirect, incidental, special, or consequential damages resulting from the quality of services performed by independent professionals, delays, worker misconduct, or any scheduling conflicts.
            </p>
          </section>

          <div className="border-t border-gray-100 pt-4 flex items-center justify-between text-xs text-gray-400 font-medium">
            <p>© 2026 Zolvo Technologies. All rights reserved.</p>
            <button onClick={() => router.back()} className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1">
              Close Terms
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
