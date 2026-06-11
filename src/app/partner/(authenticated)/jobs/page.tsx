"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "@/providers/UserProvider";
import { useDispatch } from "@/hooks/useDispatch";
import { useWorkerJobs } from "@/hooks/useWorkerJobs";
import { JobCard } from "@/components/jobs/JobCard";
import { IncomingJobRequest } from "@/services/dispatch.service";
import { Booking } from "@/types";
import {
  Briefcase, AlertCircle, Radio, WifiOff, RefreshCw,
  MapPin, Banknote, Clock, Zap, User, Calendar
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TabType = 'new' | 'accepted' | 'active' | 'completed';

// ── Incoming Job Card ──────────────────────────────────────────────────────────
function IncomingJobCard({
  job,
  onAccept,
  isAccepting,
  onReject,
  isRejecting,
}: {
  job: IncomingJobRequest;
  onAccept: (id: string) => Promise<boolean>;
  isAccepting: boolean;
  onReject: (id: string) => Promise<boolean>;
  isRejecting: boolean;
}) {
  const clientName = job.client?.profile?.full_name ?? 'Customer';
  const amount = job.service_charge ?? job.total_price ?? 0;

  // Countdown timer logic
  const sentAtMs = job.sent_at ? new Date(job.sent_at).getTime() : Date.now();
  const windowSec = job.response_window_seconds ?? 45;
  const expiryTimeMs = sentAtMs + windowSec * 1000;
  
  const [timeLeft, setTimeLeft] = useState<number>(() => 
    Math.max(0, Math.round((expiryTimeMs - Date.now()) / 1000))
  );

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((expiryTimeMs - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiryTimeMs, timeLeft]);

  const isExpired = timeLeft <= 0;

  return (
    <div className={cn(
      "bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all",
      isExpired ? "border-gray-200 opacity-60" : "border-indigo-100 shadow-indigo-50"
    )}>
      {/* Dispatch Header Banner */}
      <div className={cn(
        "px-4 py-1.5 flex items-center justify-between",
        isExpired ? "bg-gray-400" : "bg-indigo-600"
      )}>
        <div className="flex items-center gap-1.5">
          <Zap className={cn("w-3.5 h-3.5 text-white", !isExpired && "animate-pulse")} />
          <p className="text-xs font-bold text-white uppercase tracking-widest">
            {job.booking_type === 'scheduled' ? 'Scheduled Job Request' : 'New ASAP Job Request'}
          </p>
        </div>
        {!isExpired && (
          <span className="text-xs font-black bg-white/20 text-white px-2 py-0.5 rounded-md font-mono">
            Expires in: {timeLeft}s
          </span>
        )}
        {isExpired && (
          <span className="text-xs font-bold bg-black/10 text-white px-2 py-0.5 rounded-md font-mono">
            Time Expired
          </span>
        )}
      </div>

      <div className="p-4">
        {/* Scheduled Info Badge */}
        {job.booking_type === 'scheduled' && job.scheduled_for && (
          <div className="flex items-center gap-2 text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-2 rounded-xl mb-3">
            <Calendar className="w-4 h-4 shrink-0 text-indigo-500" />
            <span className="text-xs font-bold">
              Scheduled For: {new Date(job.scheduled_for).toLocaleDateString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short'
              })} at {new Date(job.scheduled_for).toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>
        )}

        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-black text-gray-900 mb-0.5">{job.category}</h3>
            <p className="text-sm text-gray-500 line-clamp-1">{job.description}</p>
          </div>
          <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full shrink-0">
            <Banknote className="w-3.5 h-3.5" />
            <span className="text-xs font-black">₹{Number(amount).toLocaleString('en-IN')}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 mb-4 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-medium">{clientName}</span>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
            <span className="font-medium line-clamp-2">{job.location_address ?? 'Location not provided'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="font-medium">
              Received:{' '}
              {new Date(job.created_at).toLocaleString('en-IN', {
                hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
              })}
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => onReject(job.id)}
            disabled={isRejecting || isAccepting || isExpired}
            className="flex-1 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {isRejecting ? 'Rejecting...' : '✕ Reject'}
          </button>
          
          <button
            onClick={() => onAccept(job.id)}
            disabled={isAccepting || isRejecting || isExpired}
            className="flex-[2] h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isAccepting ? 'Accepting...' : '✓ Accept Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PartnerJobsPage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>('new');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const {
    incomingJobs,
    isLoading: isDispatchLoading,
    isRealtimeConnected,
    error: dispatchError,
    workerStatus,
    acceptJob,
    rejectJob,
    refresh,
  } = useDispatch(user?.uid ?? null);

  const {
    activeJobs,
    completedJobs,
    isLoading: isJobsLoading,
    error: jobsError,
  } = useWorkerJobs(user?.uid ?? null);

  const handleAccept = async (id: string): Promise<boolean> => {
    setAcceptingId(id);
    const success = await acceptJob(id);
    setAcceptingId(null);
    return success;
  };

  const handleReject = async (id: string): Promise<boolean> => {
    setRejectingId(id);
    const success = await rejectJob(id);
    setRejectingId(null);
    return success;
  };

  // Split Active Jobs into Accepted (before work) vs In Progress (work ongoing)
  const acceptedJobs = activeJobs.filter(
    (b) => b.status === "accepted" || b.status === "worker_arriving"
  );
  
  const runningJobs = activeJobs.filter(
    (b) => b.status !== "accepted" && b.status !== "worker_arriving"
  );

  const TABS: { id: TabType; label: string; count: number }[] = [
    { id: 'new', label: 'New', count: incomingJobs.length },
    { id: 'accepted', label: 'Accepted', count: acceptedJobs.length },
    { id: 'active', label: 'In Progress', count: runningJobs.length },
    { id: 'completed', label: 'History', count: completedJobs.length },
  ];

  const isLoading = activeTab === 'new' ? isDispatchLoading : isJobsLoading;
  const error = activeTab === 'new' ? dispatchError : jobsError;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pb-0 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-black text-gray-900">Jobs Management</h1>
          <div className="flex items-center gap-2">
            {activeTab === 'new' && (
              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border",
                isRealtimeConnected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-gray-100 text-gray-500 border-gray-200"
              )}>
                {isRealtimeConnected
                  ? <><Radio className="w-3 h-3 animate-pulse" /> Live</>
                  : <><WifiOff className="w-3 h-3" /> Polling</>}
              </div>
            )}
            <div className={cn(
              "px-2.5 py-1 rounded-full text-xs font-bold border",
              workerStatus === 'online'
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : workerStatus === 'busy'
                ? "bg-amber-50 text-amber-700 border-amber-100"
                : "bg-gray-100 text-gray-500 border-gray-200"
            )}>
              {workerStatus === 'online' ? '🟢 Online' : workerStatus === 'busy' ? '🟠 Busy' : '⚫ Offline'}
            </div>
            <button onClick={refresh} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 pb-3 px-3 font-bold text-sm transition-colors border-b-2 shrink-0",
                activeTab === tab.id
                  ? "text-indigo-600 border-indigo-600"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  "text-xs font-black px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                  activeTab === tab.id ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        {activeTab === 'new' && workerStatus !== 'online' && !isLoading && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
            <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">
                {workerStatus === 'busy' ? 'You are busy on a job' : 'You are offline'}
              </p>
              <p className="text-xs text-amber-600">
                {workerStatus === 'busy'
                  ? 'Complete your active job to receive new requests.'
                  : 'Go to dashboard to turn on availability to receive jobs.'}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4 mb-4">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm font-medium text-red-700">{error}</p>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
          </div>
        ) : activeTab === 'new' ? (
          incomingJobs.length > 0 ? (
            <div className="flex flex-col gap-3 animate-in fade-in duration-300">
              {incomingJobs.map((job) => (
                <IncomingJobCard
                  key={job.id}
                  job={job}
                  onAccept={handleAccept}
                  isAccepting={acceptingId === job.id}
                  onReject={handleReject}
                  isRejecting={rejectingId === job.id}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              message={workerStatus === 'online'
                ? "You're all caught up! New job requests will appear here instantly."
                : workerStatus === 'busy'
                ? "You have active jobs in progress. Check Accepted and In Progress tabs."
                : "Go online to start receiving job requests in your city."}
            />
          )
        ) : (
          (() => {
            let jobs: Booking[] = [];
            if (activeTab === 'accepted') jobs = acceptedJobs;
            else if (activeTab === 'active') jobs = runningJobs;
            else jobs = completedJobs;

            return jobs.length > 0 ? (
              <div className="flex flex-col gap-3 animate-in fade-in duration-300">
                {jobs.map((job: Booking) => <JobCard key={job.id} job={job} />)}
              </div>
            ) : (
              <EmptyState
                message={activeTab === 'accepted'
                  ? "Accepted jobs (before you start working) will appear here."
                  : activeTab === 'active'
                  ? "Jobs currently in progress will appear here."
                  : "Your completed job history will appear here."}
              />
            );
          })()
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center pt-24 px-6 text-center">
      <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4 border border-blue-100">
        <Briefcase size={36} className="text-blue-300" />
      </div>
      <h2 className="text-lg font-bold text-gray-800 mb-2">Nothing here</h2>
      <p className="text-gray-500 text-sm font-medium max-w-[260px]">{message}</p>
    </div>
  );
}
