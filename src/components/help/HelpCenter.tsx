'use client';

import React, { useState } from 'react';
import { HelpCircle, Search, ChevronRight } from 'lucide-react';

const FAQs = [
  { q: "How do I book a service professional?", a: "Search for electrical or plumbing services on the home page, select a verified professional, and choose your preferred time slot." },
  { q: "What payment methods are supported?", a: "Jero operates under a Cash-On-Delivery or Direct UPI model. You pay the professional directly after the job is completed to your satisfaction." },
  { q: "Are the professionals background checked?", a: "Yes, every service provider undergoes comprehensive identity document verification, database background screening, and skill testing before approval." },
  { q: "What is the active service area for Jero?", a: "We currently operate exclusively within Bhilwara, Rajasthan. All bookings are geofenced to active municipal service zones." },
  { q: "What happens if a professional cancels or doesn't show up?", a: "If a provider cancels, the booking goes back into the dispatch pool to automatically find a replacement. You can also contact support for fast re-assignment." },
  { q: "How is my location data handled?", a: "We only use location details to map active bookings, compute accurate provider arrivals, and verify geofenced boundaries. Your location is never shared with third-party advertisers." },
  { q: "How do I delete my account or personal data?", a: "Go to Profile -> Privacy & Security and choose 'Delete Account' or 'Request Data Deletion'. Formal deletion requests are reviewed and processed within 48 hours." },
  { q: "What should I do if there is a payment dispute or safety issue?", a: "Use the 'Report Abuse' feature in the Privacy & Security panel, or contact our support hotline at 7014868682 immediately." },
];

export function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const filteredFAQs = FAQs.filter(faq => 
    faq.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
    faq.a.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-indigo-500" /> Help Center & FAQ
        </h2>
      </div>

      <div className="p-5 border-b border-gray-50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search FAQ articles..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border-transparent focus:bg-white rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all border outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col divide-y divide-gray-50">
        {filteredFAQs.length > 0 ? (
          filteredFAQs.map((faq, i) => {
            const originalIndex = FAQs.findIndex(f => f.q === faq.q);
            const isOpen = activeFaq === originalIndex;
            return (
              <div key={i} className="transition-colors hover:bg-gray-50/50">
                <button 
                  onClick={() => setActiveFaq(isOpen ? null : originalIndex)}
                  className="w-full flex items-start justify-between p-5 text-left"
                >
                  <p className="font-semibold text-gray-900 text-sm pr-4">{faq.q}</p>
                  <ChevronRight className={`w-5 h-5 text-gray-400 mt-0.5 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs text-gray-500 leading-relaxed bg-gray-50/20">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">
            No FAQ articles match your search.
          </div>
        )}
      </div>
    </section>
  );
}
