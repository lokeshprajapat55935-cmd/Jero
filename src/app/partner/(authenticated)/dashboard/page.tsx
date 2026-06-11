"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@/providers/UserProvider";
import { createClient } from "@/lib/supabase/client";
import { 
  AlertCircle, CheckCircle2, Clock, Ban, Wallet, 
  TrendingUp, Briefcase, CheckSquare, Star, ArrowRight, 
  Wifi, WifiOff, Loader2 
} from "lucide-react";
import { useRouter } from "next/navigation";
import { dispatchService } from "@/services/dispatch.service";
import toast from "react-hot-toast";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

export default function PartnerDashboard() {
  const { profile, loading: authLoading } = useUser();
  const router = useRouter();
  
  const [partner, setPartner] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Real data stats
  const [walletBalance, setWalletBalance] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [activeJobsCount, setActiveJobsCount] = useState(0);
  const [todayCompletedJobs, setTodayCompletedJobs] = useState(0);
  const [ratingAvg, setRatingAvg] = useState(5.0);
  
  // Availability status
  const [isOnline, setIsOnline] = useState(false);
  const [availStatus, setAvailStatus] = useState<string>("offline");
  const [lastActiveAt, setLastActiveAt] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // 1. Defensive Check: Customer attempting to access Worker dashboard
  useEffect(() => {
    if (profile && profile.role !== 'worker') {
      console.log('Defensive Check: Redirecting customer away from worker dashboard', { role: profile.role });
      router.replace('/dashboard');
    }
  }, [profile, router]);

  const fetchDashboardStats = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    if (profile.role !== 'worker') {
      setLoading(false);
      return;
    }
    
    const supabase = createClient();
    
    // 1. Fetch partner status details
    const { data: partnerData, error: partnerErr } = await supabase
      .from('partners')
      .select('*')
      .eq('profile_id', profile.id)
      .maybeSingle();
      
    if (partnerErr) {
      console.error("Error fetching partner status", partnerErr);
    }
    
    if (!partnerData || !partnerData.current_step || partnerData.current_step < 6) {
      console.log("No completed partner record, redirecting to onboarding", { role: profile.role });
      router.replace('/partner/onboarding');
      return;
    }
    
    if (partnerData.status === 'pending' || partnerData.status === 'under_review') {
      console.log("Partner status is pending/under-review, redirecting to application under review", { status: partnerData.status });
      router.replace('/partner/application-under-review');
      return;
    }

    if (partnerData.status === 'rejected') {
      console.log("Partner status is rejected, redirecting to rejected screen");
      router.replace('/partner/rejected');
      return;
    }
    
    setPartner(partnerData);

    // Only fetch stats if approved
    if (partnerData.status === 'approved') {
      try {
        // 2. Fetch Wallet Balance
        const { data: walletData } = await supabase
          .from('worker_wallets')
          .select('balance')
          .eq('worker_id', profile.id)
          .maybeSingle();
        setWalletBalance(Number(walletData?.balance ?? 0));

        // 3. Fetch Active Bookings count
        const { count: activeCount } = await supabase
          .from('active_bookings')
          .select('booking_id', { count: 'exact', head: true })
          .eq('worker_id', profile.id);
        setActiveJobsCount(activeCount ?? 0);

        // 4. Fetch Availability status
        const { data: availData } = await supabase
          .from('worker_availability')
          .select('status, last_active_at')
          .eq('worker_id', profile.id)
          .maybeSingle();
        const currentStatus = availData?.status ?? 'offline';
        setAvailStatus(currentStatus);
        setIsOnline(currentStatus === 'online');
        setLastActiveAt(availData?.last_active_at ?? null);

        // 5. Fetch Today's Analytics (earnings & completed jobs count)
        const res = await fetch('/api/worker/analytics?period=today');
        const payload = await res.json();
        if (payload.success && payload.data) {
          setTodayEarnings(payload.data.netEarnings ?? 0);
          setTodayCompletedJobs(payload.data.totalJobs ?? 0);
          setRatingAvg(payload.data.ratingAvg ?? 5.0);
        }
      } catch (statsErr) {
        console.error("Error fetching stats:", statsErr);
      }
    }
    setLoading(false);
  }, [profile, router]);

  useEffect(() => {
    if (!authLoading) {
      fetchDashboardStats();
    }
  }, [authLoading, fetchDashboardStats]);

  const handleToggleAvailability = async () => {
    if (isToggling) return;
    setIsToggling(true);
    const { data, error } = await dispatchService.toggleAvailability();
    setIsToggling(false);
    if (error) {
      toast.error(error);
    } else if (data) {
      const isOnlineVal = data.status === 'online';
      setIsOnline(isOnlineVal);
      setAvailStatus(data.status);
      setLastActiveAt(new Date().toISOString());
      toast.success(isOnlineVal ? "You are now online!" : `Your status is now ${data.status}.`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // --- Lock Screens based on Status ---

  if (partner?.status === 'pending' || partner?.status === 'under_review') {
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
            Status: <span className="text-indigo-600 uppercase tracking-widest">{partner.status.replace('_', ' ')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (partner?.status === 'rejected') {
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

  if (partner?.status === 'suspended') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border border-gray-100">
          <div className="mx-auto w-20 h-20 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-6">
            <AlertCircle size={40} />
          </div>
          <h1 className="text-2xl font-black text-gray-900 mb-2">Account Suspended</h1>
          <p className="text-gray-500 font-medium leading-relaxed">
            Your partner account has been temporarily suspended due to policy violations.
          </p>
        </div>
      </div>
    );
  }

  // --- Approved Dashboard ---

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start w-full md:w-auto">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl md:text-3xl font-black text-gray-900">Partner Dashboard</h1>
                <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold text-xs border border-emerald-100 uppercase tracking-wider shrink-0">
                  <CheckCircle2 size={12} /> Approved
                </div>
              </div>
              <p className="text-gray-500 font-medium">Welcome back, {partner?.full_name}</p>
            </div>
            <div className="md:hidden pt-1 shrink-0">
              <NotificationCenter />
            </div>
          </div>

          {/* Availability Switch */}
          <div className="flex flex-row md:flex-col w-full md:w-auto items-center md:items-end gap-3 justify-between">
            <div className="hidden md:block">
              <NotificationCenter />
            </div>
            <div className="flex flex-col items-stretch md:items-end w-full md:w-auto">
              <button
                onClick={handleToggleAvailability}
                disabled={isToggling || availStatus === 'busy'}
                className={`w-full md:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-extrabold text-sm transition-all shadow-sm ${
                  availStatus === 'online'
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : availStatus === 'busy'
                    ? "bg-amber-500 text-white cursor-not-allowed"
                    : availStatus === 'unavailable'
                    ? "bg-red-500 text-white hover:bg-red-600"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                }`}
              >
                {isToggling ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Updating Status...
                  </>
                ) : availStatus === 'online' ? (
                  <>
                    <Wifi size={16} className="animate-pulse" />
                    ONLINE (Receiving Jobs)
                  </>
                ) : availStatus === 'busy' ? (
                  <>
                    <Clock size={16} />
                    BUSY (On a Job)
                  </>
                ) : availStatus === 'unavailable' ? (
                  <>
                    <Ban size={16} />
                    UNAVAILABLE
                  </>
                ) : (
                  <>
                    <WifiOff size={16} />
                    OFFLINE (Go Online)
                  </>
                )}
              </button>
              {lastActiveAt && (
                <p className="text-[10px] text-gray-400 mt-1.5 text-center md:text-right font-semibold">
                  Last active: {new Date(lastActiveAt).toLocaleString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    day: 'numeric',
                    month: 'short'
                  })}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          
          {/* Wallet Balance */}
          <div className="bg-white p-5 md:p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
            <div className="flex items-start justify-between">
              <span className="text-xs md:text-sm text-gray-400 font-bold uppercase tracking-wider">Wallet Balance</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Wallet size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-black text-gray-900 mt-2">
                ₹{walletBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">Updates after job commission</p>
            </div>
          </div>

          {/* Today's Net Earnings */}
          <div className="bg-white p-5 md:p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
            <div className="flex items-start justify-between">
              <span className="text-xs md:text-sm text-gray-400 font-bold uppercase tracking-wider">Today&apos;s Earnings</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <TrendingUp size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-black text-emerald-600 mt-2">
                ₹{todayEarnings.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">Today&apos;s completed jobs net payout</p>
            </div>
          </div>

          {/* Active Jobs */}
          <div className="bg-white p-5 md:p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px] col-span-1">
            <div className="flex items-start justify-between">
              <span className="text-xs md:text-sm text-gray-400 font-bold uppercase tracking-wider">Active Jobs</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Briefcase size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-black text-gray-900 mt-2">{activeJobsCount}</p>
              <p className="text-[10px] text-gray-400 mt-1">Jobs currently in progress</p>
            </div>
          </div>

          {/* Completed Jobs */}
          <div className="bg-white p-5 md:p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px]">
            <div className="flex items-start justify-between">
              <span className="text-xs md:text-sm text-gray-400 font-bold uppercase tracking-wider">Completed Today</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <CheckSquare size={18} />
              </div>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-black text-gray-900 mt-2">{todayCompletedJobs}</p>
              <p className="text-[10px] text-gray-400 mt-1">Total jobs finished today</p>
            </div>
          </div>

          {/* Profile Rating */}
          <div className="bg-white p-5 md:p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[140px] col-span-2 md:col-span-1">
            <div className="flex items-start justify-between">
              <span className="text-xs md:text-sm text-gray-400 font-bold uppercase tracking-wider">Profile Rating</span>
              <div className="p-2 bg-yellow-50 text-yellow-600 rounded-xl">
                <Star size={18} className="fill-yellow-500 text-yellow-500" />
              </div>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-black text-gray-900 mt-2">
                {ratingAvg.toFixed(1)} <span className="text-lg text-yellow-400">★</span>
              </p>
              <p className="text-[10px] text-gray-400 mt-1">Average rating from customers</p>
            </div>
          </div>

        </div>

        {/* Go to Jobs CTA */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 md:p-8 rounded-3xl text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-xl md:text-2xl font-black">View & Manage Job Requests</h2>
            <p className="text-indigo-100 font-medium text-sm max-w-lg">
              Check incoming broadcast job requests, accept new bookings, or update status of active in-progress bookings.
            </p>
          </div>
          <button
            onClick={() => router.push("/worker/jobs")}
            className="w-full md:w-auto bg-white text-indigo-600 hover:bg-indigo-50 px-6 py-3.5 rounded-2xl font-black text-sm transition-all shadow-md shrink-0 flex items-center justify-center gap-2"
          >
            Go to Jobs
            <ArrowRight size={16} />
          </button>
        </div>

      </div>
    </div>
  );
}
