'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Eye, Lock, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPolicyPage() {
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
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
      </div>

      {/* Content */}
      <div className="w-full max-w-2xl mx-auto p-4 flex flex-col gap-6 mt-2">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-6 text-sm text-gray-600 leading-relaxed">
          <div className="flex items-center gap-3 border-b border-gray-50 pb-4">
            <div className="bg-indigo-50 text-indigo-700 p-2.5 rounded-lg shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">Jero Data Protection Policy</h2>
              <p className="text-xs text-gray-500">Effective Date: June 7, 2026 | Version 2.4</p>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Jero Technologies (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy details how we collect, process, store, and share your personal data when you use the Jero mobile application, web application, and related local home service booking features (collectively, the &quot;Platform&quot;) in Bhilwara, Rajasthan, India. This policy is aligned with the Indian Digital Personal Data Protection (DPDP) Act, 2023, and Google Play Store developer policies.
          </p>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">1. Information We Collect</h3>
            <p>
              To establish trust and facilitate seamless home service matching between clients and independent service professionals (electricians and plumbers), we collect the following categories of information:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs">
              <li><strong>Personal Profile Information:</strong> Full name, verified mobile number, email address, physical service address, and optional profile photograph.</li>
              <li><strong>Authentication Credentials:</strong> Firebase Auth identifiers, session tokens, OTP verification logs, and device security states.</li>
              <li><strong>Geographical Location Data:</strong> Precise GPS coordinates of your device (dynamic foreground and background location) to locate nearby professionals, calculate exact ETA, and prevent geofence fraud.</li>
              <li><strong>Transaction and Ledger Details:</strong> Booking records, service invoices, wallet credits, offline cash ledger entries, and performance feedback reviews.</li>
              <li><strong>Technical Metadata:</strong> IP address, browser user-agent string, device hardware ID, operating system version, and system error audit logs.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">2. Android Location Disclosure & Usage</h3>
            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-xs flex gap-3">
              <Eye className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-blue-900 mb-1">Android Background Location Disclosure</p>
                <p className="text-blue-700 leading-normal mb-2">
                  Jero collects precise location data to support:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-blue-700 leading-normal">
                  <li>Matching customer service requests with nearby verified professionals within active municipal zones in Bhilwara.</li>
                  <li>Real-time tracking of active job routes and computing estimated times of arrival (ETA).</li>
                  <li>Ensuring security and compliance by preventing GPS-spoofing and booking fraud.</li>
                </ul>
                <p className="text-blue-800 font-semibold mt-2">
                  We request background location permission to maintain dispatcher tracking during active service runs even when the app is closed or not in active use. Your location data is strictly confidential and is never shared with third-party advertising brokers or data brokers.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">3. Data Security & Storage Hardening</h3>
            <div className="flex gap-3">
              <Lock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs">
                Your personal data is hosted within secure cloud databases managed by Supabase, protected by robust Row-Level Security (RLS) policies that validate user ownership before any data read or write operation. Access sessions are guarded by cryptographically signed HTTP cookies. System access triggers automatic logging for critical events (such as multiple failed login attempts, geographical velocity anomalies, or OTP guessing) directly into our audited security logs to prevent brute-force attacks and unauthorized database intrusion.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">4. Data Retention and Deletion</h3>
            <p>
              We retain your personal data only as long as necessary to provide marketplace services, maintain tax and billing records, and satisfy security logging protocols. Under local regulations and Google Play compliance standards, you have the following rights:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-xs">
              <li><strong>Data Access & Portability:</strong> You can download a complete JSON export of your personal profile, booking history, and active ledgers using the &quot;Download My Data&quot; button in your account.</li>
              <li><strong>Data Deletion Request:</strong> You can file a formal deletion audit request via your profile settings. This registers a high-severity ticket in our security stream for an administrator to review and purge your non-transactional database records within 48 hours.</li>
              <li><strong>Account Deactivation:</strong> You can permanently delete your account instantly using the &quot;Delete Account&quot; button. This cascades and purges your auth credentials, active sessions, and personal identifiers, rendering the profile completely anonymous.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">5. Cookie Policy</h3>
            <p>
              Our Platform uses secure cookies strictly for session authentication, role detection (`client`, `partner`, or `admin`), and security validations. We do not use persistent tracking cookies or cross-site cookies for marketing campaigns.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">6. Third-Party Data Handlers</h3>
            <p>
              We partner with verified service providers to operate our platform securely. These parties are contractually bound to process data only on our instructions:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li><strong>Supabase / PostgREST:</strong> Primary database infrastructure, host server engines, and storage.</li>
              <li><strong>Firebase:</strong> Primary authentication engine, session monitoring, and real-time push alerts.</li>
              <li><strong>Twilio / SMS Gateways:</strong> Safe dispatch of transactional OTP authorization text messages.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-extrabold text-gray-900 text-base">7. Contact & Grievance Redressal</h3>
            <p>
              If you have any questions, concerns, or data privacy complaints, or if you wish to exercise your rights under the DPDP Act, you may contact our designated Grievance Officer:
            </p>
            <div className="bg-gray-50 border border-gray-150 rounded-lg p-3 text-xs">
              <p><strong>Grievance & Privacy Officer:</strong> Jero Support Desk</p>
              <p><strong>Phone:</strong> 7014868682</p>
              <p><strong>Email:</strong> privacy@zolvo.in</p>
              <p><strong>Address:</strong> Bhilwara, Rajasthan, 311001</p>
            </div>
          </section>

          <div className="border-t border-gray-100 pt-4 flex items-center justify-between text-xs text-gray-400 font-medium">
            <p>© 2026 Jero Technologies. All rights reserved.</p>
            <button onClick={() => router.back()} className="text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1">
              Close Policy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
