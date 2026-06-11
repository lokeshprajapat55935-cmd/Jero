"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, ChevronDown, ChevronUp } from "lucide-react";

interface PolicySection {
  id: string;
  title: string;
  content: string[];
}

const POLICY_SECTIONS: PolicySection[] = [
  {
    id: "partner-terms",
    title: "Partner Terms & Conditions",
    content: [
      "1. Eligibility: To become a Zolvo Partner, you must be at least 18 years of age, hold valid identity documents, and possess relevant professional skills in your chosen service category.",
      "2. Service Standards: You agree to provide services with the highest professional standards. All work must meet industry quality benchmarks. Any damage caused during service delivery is your responsibility.",
      "3. Timely Arrival: You must arrive at the customer's location within the agreed timeframe. Habitual cancellations or no-shows may result in account suspension.",
      "4. Conduct: You must treat all customers with respect. Harassment, discrimination, or inappropriate behaviour will result in immediate termination of your Zolvo partnership.",
      "5. Accuracy of Information: You are responsible for ensuring all information provided during onboarding (qualifications, documents, bank details) is accurate and current.",
      "6. Account Responsibility: You are solely responsible for maintaining the confidentiality of your account. Do not share your login credentials with others.",
      "7. Platform Fees: Zolvo charges a service commission on completed bookings. The current commission rate is communicated in your dashboard and may change with 30 days' notice.",
      "8. Intellectual Property: You may not use Zolvo's name, logo, or brand assets in any manner not expressly authorised by Zolvo.",
      "9. Termination: Zolvo reserves the right to suspend or terminate partner accounts for violations of these terms, customer complaints, or fraudulent activity.",
    ],
  },
  {
    id: "privacy-policy",
    title: "Privacy Policy",
    content: [
      "1. Information We Collect: We collect personal information including name, phone number, address, Aadhaar/PAN number, bank account details, and uploaded documents during onboarding.",
      "2. How We Use Your Data: Your data is used to verify your identity, process payouts, match you with customers, and improve our platform services.",
      "3. Data Storage: All data is stored securely on encrypted servers. Financial information is handled with bank-grade security standards.",
      "4. Data Sharing: We do not sell your personal data to third parties. Data may be shared with regulatory authorities if legally required or with payment processors for payout purposes.",
      "5. Document Security: KYC documents uploaded to Zolvo are stored in encrypted cloud storage. Access is restricted to authorised Zolvo personnel only.",
      "6. Cookies: We use cookies to maintain your session and improve app experience. You can disable cookies in your browser settings, though some features may not work correctly.",
      "7. Your Rights: You have the right to request access to, correction of, or deletion of your personal data. Contact support@zolvo.in to exercise these rights.",
      "8. Data Retention: We retain your data as long as your account is active. Upon account deletion, data is purged within 90 days, except where legally required to retain.",
      "9. Updates: We may update this Privacy Policy periodically. Continued use of the app after changes constitutes acceptance of the updated policy.",
    ],
  },
  {
    id: "refund-policy",
    title: "Refund & Cancellation Policy",
    content: [
      "1. Job Cancellations by Partner: If you cancel a confirmed job without valid reason, a penalty of ₹50 or 10% of the booking amount (whichever is higher) may be deducted from your earnings.",
      "2. Customer Cancellations: If a customer cancels a booking after you have already reached their location, you are eligible for a visit charge compensation as per the platform's compensation policy.",
      "3. Disputed Payments: If a customer disputes a payment, Zolvo will conduct an investigation. Funds may be held during the investigation period. The outcome of the investigation is binding.",
      "4. Payout Delays: Payouts are processed on a weekly basis (every Monday). Delays may occur due to bank holidays, technical issues, or compliance verification.",
      "5. Incomplete Services: If a customer reports that a service was not completed satisfactorily, Zolvo reserves the right to withhold or reduce payment pending resolution.",
      "6. Double Payments: In case of any duplicate or erroneous payment to your account, Zolvo reserves the right to recover the excess amount from future payouts.",
    ],
  },
  {
    id: "commission-policy",
    title: "Commission Policy",
    content: [
      "1. Standard Commission: Zolvo charges a platform commission of 15% on all completed bookings. This is deducted automatically from the booking amount before payout.",
      "2. Emergency Bookings: For emergency dispatch bookings, a lower commission of 10% is charged in recognition of the urgent nature of the service.",
      "3. Payout Schedule: Net earnings (booking amount minus commission) are credited to your registered bank account every Monday for the previous week's completed bookings.",
      "4. Minimum Payout Threshold: Payouts are processed only when your accumulated earnings exceed ₹100. Amounts below this threshold are carried over to the next payout cycle.",
      "5. Commission Changes: Zolvo reserves the right to revise commission rates. Partners will be notified at least 30 days in advance of any changes.",
      "6. Tax Compliance: Zolvo is responsible for platform-level GST. Partners are individually responsible for filing and paying their own income taxes on earnings received.",
      "7. Referral Bonuses: If Zolvo introduces a referral programme, referred partners' first month earnings will be commission-free. Details will be communicated separately.",
      "8. Dispute on Commission: If you believe a commission deduction was made in error, you may raise a dispute within 7 days of the payout. Email billing@zolvo.in with booking details.",
    ],
  },
];

export default function TermsPoliciesPage() {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string>("partner-terms");

  const toggleSection = (id: string) => {
    setExpanded((prev) => (prev === id ? "" : id));
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
            <h1 className="text-base font-black text-gray-900">Terms & Policies</h1>
            <p className="text-xs text-gray-500">Zolvo Partner legal documents</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-3">
        {/* Intro Card */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-4 flex items-start gap-3">
          <FileText className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-indigo-900">Please read carefully</p>
            <p className="text-xs text-indigo-600 mt-0.5">
              These terms govern your use of the Zolvo platform as a service partner. Last updated: June 2026.
            </p>
          </div>
        </div>

        {/* Accordion Sections */}
        {POLICY_SECTIONS.map((section) => {
          const isOpen = expanded === section.id;
          return (
            <div
              key={section.id}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-black text-gray-800">{section.title}</span>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-gray-50 space-y-3 max-h-96 overflow-y-auto">
                  {section.content.map((paragraph, idx) => (
                    <p
                      key={idx}
                      className="text-xs text-gray-600 leading-relaxed font-medium pt-3"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Footer */}
        <div className="text-center py-4 space-y-1">
          <p className="text-xs text-gray-400 font-medium">
            Questions? Contact us at{" "}
            <a href="mailto:support@zolvo.in" className="text-indigo-500 font-bold hover:underline">
              support@zolvo.in
            </a>
          </p>
          <p className="text-[10px] text-gray-300">Zolvo Technologies Pvt. Ltd. · Bhilwara, Rajasthan</p>
        </div>
      </div>
    </div>
  );
}
