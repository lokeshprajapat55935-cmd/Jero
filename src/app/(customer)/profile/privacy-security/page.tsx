'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SecurityPanel } from '@/components/security/SecurityPanel';

export default function PrivacySecurityPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col min-h-screen bg-gray-100/60 pb-20 md:pb-0">
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-20 flex items-center gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()}
          className="shrink-0 -ml-2 text-gray-500 hover:text-gray-900 rounded-full h-10 w-10"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold tracking-tight text-gray-900">Privacy & Security</h1>
      </div>

      <div className="w-full max-w-2xl mx-auto p-4 flex flex-col gap-6 mt-2">
        <SecurityPanel />
      </div>
    </div>
  );
}
