'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, ChevronLeft, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

type VerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected' | null;

interface VerificationData {
  full_name: string;
  dob: string;
  gender: string;
}

export default function CustomerVerificationPage() {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<VerificationStatus>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  
  const [step, setStep] = useState(1);
  const [data, setData] = useState<VerificationData>({
    full_name: '',
    dob: '',
    gender: 'male',
  });

  useEffect(() => {
    fetchVerificationStatus();
  }, [user]);

  const fetchVerificationStatus = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/customer/verification');
      const json = await res.json();
      if (json.success && json.data) {
        setStatus(json.data.status);
        if (json.data.verification_notes) {
          setRejectionNotes(json.data.verification_notes);
        }
      } else {
        setStatus('unverified');
      }
    } catch (err) {
      toast.error("Failed to load verification status");
      setStatus('unverified');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/customer/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();

      if (json.success) {
        toast.success("Verification submitted successfully");
        setStatus('pending');
      } else {
        toast.error(json.error || "Failed to submit");
      }
    } catch (error) {
      console.error(error);
      toast.error("Submit failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  // STATUS SCREENS
  if (status === 'pending') {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
          <Clock size={40} />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Verification Under Review</h1>
        <p className="text-gray-500 max-w-sm mb-8">
          Your information has been submitted and is currently being reviewed by our team.
        </p>
        <Button onClick={() => router.push('/profile')} variant="outline">Back to Profile</Button>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
          <ShieldCheck size={40} />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">Account Verified</h1>
        <p className="text-gray-500 max-w-sm mb-8">
          Your identity has been verified successfully. You now have full access to all features.
        </p>
        <Button onClick={() => router.push('/profile')} className="bg-green-600 hover:bg-green-700 text-white">Back to Profile</Button>
      </div>
    );
  }

  // WIZARD RENDERER
  const canProceedStep1 = data.full_name.trim() !== '' && data.dob && data.gender;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
          <ChevronLeft size={24} />
        </button>
        <h1 className="ml-2 text-lg font-bold text-gray-900">Identity Verification</h1>
      </div>

      {status === 'rejected' && step === 1 && (
        <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-3 text-red-800">
            <AlertCircle className="shrink-0 w-5 h-5 mt-0.5" />
            <div>
              <h3 className="font-bold">Verification Rejected</h3>
              <p className="text-sm mt-1">{rejectionNotes || "Please review and resubmit your details."}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 p-4 max-w-xl mx-auto w-full">
        {/* Progress */}
        <div className="mb-8 mt-4">
          <div className="flex items-center justify-between">
            {[1, 2].map(s => (
              <div key={s} className="flex flex-col items-center flex-1 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold z-10 relative ${
                  step === s ? 'bg-blue-600 text-white' : 
                  step > s ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s ? <CheckCircle2 size={16} /> : s}
                </div>
                {s < 2 && (
                  <div className={`absolute top-1/2 left-1/2 w-full h-1 -translate-y-1/2 ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* STEP 1: Personal Info */}
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <div>
              <h2 className="text-xl font-black text-gray-900">Personal Information</h2>
              <p className="text-gray-500 text-sm mt-1">Enter your correct details for verification.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Full Legal Name</label>
                <input 
                  type="text" 
                  value={data.full_name}
                  onChange={e => setData({...data, full_name: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Date of Birth</label>
                <input 
                  type="date" 
                  value={data.dob}
                  onChange={e => setData({...data, dob: e.target.value})}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Gender</label>
                <div className="flex gap-3">
                  {['male', 'female', 'other'].map(g => (
                    <button 
                      key={g}
                      onClick={() => setData({...data, gender: g})}
                      className={`flex-1 py-3 px-4 rounded-xl font-semibold border capitalize ${
                        data.gender === g ? 'bg-blue-50 border-blue-600 text-blue-700' : 'border-gray-200 text-gray-600 bg-white'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button 
              className="w-full py-6 text-lg rounded-xl mt-6 bg-blue-600 hover:bg-blue-700 text-white" 
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
            >
              Continue
            </Button>
          </div>
        )}

        {/* STEP 2: Review */}
        {step === 2 && (
          <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
            <div>
              <h2 className="text-xl font-black text-gray-900">Review Information</h2>
              <p className="text-gray-500 text-sm mt-1">Please confirm your details before submitting.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden p-6 space-y-4">
              <div>
                <p className="text-xs text-gray-500">Name</p>
                <p className="font-bold text-gray-900 text-lg">{data.full_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Date of Birth</p>
                  <p className="font-semibold text-gray-900">{data.dob}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Gender</p>
                  <p className="font-semibold text-gray-900 capitalize">{data.gender}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <Button disabled={isSubmitting} onClick={() => setStep(1)} variant="outline" className="w-1/3 py-6 rounded-xl text-lg">Edit</Button>
              <Button disabled={isSubmitting} onClick={handleSubmit} className="w-2/3 py-6 rounded-xl text-lg bg-blue-600 hover:bg-blue-700 text-white">
                {isSubmitting ? 'Submitting...' : 'Submit Now'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
