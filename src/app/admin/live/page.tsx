'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Search,
  RefreshCw,
  Wrench,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  AlertOctagon,
  CornerDownRight,
  ShieldAlert,
  Sliders,
  UserPlus,
  Play,
  Lock,
  Loader2,
} from 'lucide-react';
import { useUser } from '@/providers/UserProvider';

interface Booking {
  id: string;
  status: string;
  category: string;
  total_price: number;
  payment_method: string;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  location_address?: string;
  client?: { profile?: { full_name: string } } | any;
  worker?: { profile?: { full_name: string }; category?: string } | any;
  worker_id: string | null;
  client_id?: string;
}

interface Worker {
  id: string;
  category: string;
  status: string;
  rating_avg: number;
  city_id: string;
  availability?: { status: string; last_active_at: string } | any;
  profile?: { full_name: string } | any;
}

interface DispatchHistoryItem {
  dispatch_id: string;
  booking_id: string;
  category: string;
  booking_status: string;
  client_name: string;
  dispatch_status: string;
  attempt_count: number;
  max_attempts: number;
  current_radius_km: number;
  dispatched_at: string;
  attempts: {
    attempt_id: string;
    worker_id: string;
    worker_name: string;
    status: string;
    sent_at: string;
    responded_at: string;
    rejection_reason: string;
  }[];
}

export default function LiveOpsPage() {
  const { profile } = useUser();
  const adminRole = profile?.admin_role ?? 'super_admin';
  const isReadOnly = adminRole === 'support_admin';

  // Live snapshot data
  const [snapshot, setSnapshot] = useState<any>({
    active_bookings: 0,
    online_workers: 0,
    open_disputes: 0,
    today_revenue: 0,
    today_bookings: 0,
    broadcasting_bookings: 0,
    failed_dispatches: 0,
    active_dispatches: 0,
  });

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [dispatchHistory, setDispatchHistory] = useState<DispatchHistoryItem[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerStatusFilter, setWorkerStatusFilter] = useState<string>('all');
  const [countdown, setCountdown] = useState(10);
  const [activeRightTab, setActiveRightTab] = useState<'workers' | 'history'>('workers');

  // Control Modals
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [modalType, setModalType] = useState<'assign' | 'reassign' | 'cancel' | null>(null);
  const [reason, setReason] = useState('');
  const [targetWorkerId, setTargetWorkerId] = useState('');

  // Fetch Data Function
  const fetchData = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      setRefreshing(true);

      const [liveRes, historyRes] = await Promise.all([
        fetch('/api/admin/live'),
        fetch('/api/admin/dispatch/history'),
      ]);

      if (liveRes.ok) {
        const liveJson = await liveRes.json();
        setSnapshot(liveJson.data.snapshot || {});
        setBookings(liveJson.data.active_bookings || []);
        setWorkers(liveJson.data.online_workers || []);
      }

      if (historyRes.ok) {
        const histJson = await historyRes.json();
        setDispatchHistory(histJson.data || []);
      }
    } catch (err) {
      console.error('Error fetching live operations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCountdown(10);
    }
  };

  // Auto-polling effect
  useEffect(() => {
    fetchData(true);

    const pollInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(pollInterval);
  }, []);

  // Action: Force Assign / Reassign
  const handleAssignWorker = async () => {
    if (isReadOnly) return;
    if (!selectedBooking || !targetWorkerId || !reason) return;

    try {
      setRefreshing(true);
      const isReassign = selectedBooking.worker_id !== null;
      const endpoint = isReassign ? '/api/admin/bookings' : '/api/admin/dispatch/assign';
      const method = isReassign ? 'PUT' : 'POST';

      const payload = isReassign
        ? { booking_id: selectedBooking.id, new_worker_id: targetWorkerId, reason }
        : { booking_id: selectedBooking.id, worker_id: targetWorkerId, reason };

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Action failed');
      }

      alert(isReassign ? 'Worker reassigned successfully!' : 'Worker force-assigned successfully!');
      closeModal();
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    } finally {
      setRefreshing(false);
    }
  };

  // Action: Cancel Booking
  const handleCancelBooking = async () => {
    if (isReadOnly) return;
    if (!selectedBooking || !reason) return;

    try {
      setRefreshing(true);
      const res = await fetch('/api/admin/bookings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: selectedBooking.id, reason }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Cancel failed');
      }

      alert('Booking cancelled successfully');
      closeModal();
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    } finally {
      setRefreshing(false);
    }
  };

  // Action: Worker Override (Suspend / Mark Offline)
  const handleWorkerOverride = async (workerId: string, actionType: 'suspend' | 'unavailable') => {
    if (isReadOnly) return;

    const confirmMsg =
      actionType === 'suspend'
        ? 'Are you sure you want to suspend this professional?'
        : 'Are you sure you want to mark this professional as unavailable?';

    if (!window.confirm(confirmMsg)) return;

    try {
      setRefreshing(true);
      const payload =
        actionType === 'suspend'
          ? { worker_id: workerId, status: 'suspended', moderation_note: 'Suspended via Live Operations Center' }
          : { worker_id: workerId, status: 'approved', availability_status: 'unavailable' };

      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Status override failed');
      }

      alert(actionType === 'suspend' ? 'Professional suspended.' : 'Professional marked unavailable.');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    } finally {
      setRefreshing(false);
    }
  };

  const closeModal = () => {
    setSelectedBooking(null);
    setModalType(null);
    setReason('');
    setTargetWorkerId('');
  };

  // Filter Bookings
  const filteredBookings = bookings.filter((b) => {
    const q = searchQuery.toLowerCase();
    const clientName = b.client?.profile?.full_name || '';
    const workerName = b.worker?.profile?.full_name || '';
    const category = b.category || '';
    const id = b.id || '';
    return (
      clientName.toLowerCase().includes(q) ||
      workerName.toLowerCase().includes(q) ||
      category.toLowerCase().includes(q) ||
      id.includes(q)
    );
  });

  // Pipeline Categorization
  const pipeline = {
    searching: filteredBookings.filter((b) => ['pending', 'broadcasting'].includes(b.status)),
    assigned: filteredBookings.filter((b) => ['accepted', 'worker_arriving'].includes(b.status)),
    inProgress: filteredBookings.filter((b) => ['work_started', 'started', 'awaiting_item_approval', 'item_approved', 'work_completed_pending_otp', 'otp_generated', 'otp_verified', 'awaiting_payment', 'payment_processing', 'payment_verified'].includes(b.status)),
    completed: filteredBookings.filter((b) => ['completed', 'paid_completed'].includes(b.status)),
    cancelled: filteredBookings.filter((b) => b.status === 'cancelled'),
  };

  // Filter Workers
  const filteredWorkers = workers.filter((w) => {
    const q = workerSearch.toLowerCase();
    const name = w.profile?.full_name || '';
    const category = w.category || '';
    const matchesSearch = name.toLowerCase().includes(q) || category.toLowerCase().includes(q);

    const avail = Array.isArray(w.availability) ? w.availability[0] : w.availability;
    const status = avail?.status || 'offline';

    const matchesStatus =
      workerStatusFilter === 'all' ||
      (workerStatusFilter === 'online' && status === 'online' && w.status === 'approved') ||
      (workerStatusFilter === 'busy' && status === 'busy' && w.status === 'approved') ||
      (workerStatusFilter === 'offline' && status === 'offline' && w.status === 'approved') ||
      (workerStatusFilter === 'pending' && w.status === 'pending') ||
      (workerStatusFilter === 'suspended' && w.status === 'suspended');

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 bg-[#0f0f13] border border-white/5 rounded-3xl">
        <Loader2 className="animate-spin text-violet-500" size={32} />
        <p className="text-white/50 text-sm font-semibold tracking-wide">Connecting live operations stream...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Read-Only Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Control Tower</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Activity size={22} className="text-emerald-400 animate-pulse" /> Live Dispatch & Monitoring
          </h1>
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-3 self-start sm:self-center">
          <div className="flex items-center gap-2 bg-white/2 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white/50 font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span>Refreshes in {countdown}s</span>
          </div>

          <button
            onClick={() => fetchData()}
            disabled={refreshing}
            className="h-9 w-9 rounded-xl border border-white/5 hover:bg-white/5 flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>

          {isReadOnly && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-red-400">
              <Lock size={12} />
              <span>Read-Only Session</span>
            </div>
          )}
        </div>
      </div>

      {/* Snapshot Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">Active Dispatch Pipeline</span>
          <span className="text-2xl font-black text-white tracking-tight mt-1">{snapshot.active_bookings}</span>
        </div>
        <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">Broadcasting dispatches</span>
          <span className="text-2xl font-black text-white tracking-tight mt-1 text-violet-400">{snapshot.broadcasting_bookings}</span>
        </div>
        <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">Online Workers</span>
          <span className="text-2xl font-black text-emerald-400 tracking-tight mt-1">{snapshot.online_workers}</span>
        </div>
        <div className="bg-[#0f0f13] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-white/30 tracking-widest">Failed Dispatches (Expired)</span>
          <span className="text-2xl font-black text-red-400 tracking-tight mt-1">{snapshot.failed_dispatches}</span>
        </div>
      </div>

      {/* Main Double Column Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (60%): Live Operations Pipeline */}
        <div className="xl:col-span-7 space-y-4">
          <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Pipeline Pipeline</h3>
                <p className="text-[10px] text-white/30 font-semibold">Active bookings in execution</p>
              </div>
              {/* Search Bar */}
              <div className="relative max-w-xs">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  placeholder="Search dispatches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-[#14141b] border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold text-white placeholder-white/20 outline-none focus:border-violet-500/20 transition-colors w-full"
                />
              </div>
            </div>

            {/* Pipeline Stages Lists */}
            <div className="space-y-4">
              {/* Stage: Searching */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase text-violet-400 tracking-wider">
                  <span>1. Searching / Broadcasting ({pipeline.searching.length})</span>
                  <span className="h-2 w-2 rounded-full bg-violet-400 animate-ping" />
                </div>
                {pipeline.searching.length === 0 ? (
                  <div className="p-3 bg-white/1 border border-dashed border-white/5 rounded-xl text-center text-white/20 text-xs">
                    No bookings currently broadcasting.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pipeline.searching.map((b) => (
                      <div key={b.id} className="bg-[#14141b] border border-white/5 p-3.5 rounded-xl flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[9px] font-black uppercase text-violet-400">
                              {b.category}
                            </span>
                            <span className="text-[10px] font-mono text-white/40">#{b.id.substring(0, 8)}</span>
                          </div>
                          <p className="text-xs font-bold text-white">Client: {b.client?.profile?.full_name || 'Client'}</p>
                          {b.location_address && (
                            <p className="text-[10px] text-white/40 truncate max-w-sm">{b.location_address}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedBooking(b);
                              setModalType('assign');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-[10px] font-black text-white transition-colors"
                          >
                            Force Assign
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBooking(b);
                              setModalType('cancel');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-red-500/20 text-[10px] font-bold text-red-400 hover:bg-red-500/5 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stage: Assigned */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase text-blue-400 tracking-wider">
                  2. Assigned / Arriving ({pipeline.assigned.length})
                </h4>
                {pipeline.assigned.length === 0 ? (
                  <div className="p-3 bg-white/1 border border-dashed border-white/5 rounded-xl text-center text-white/20 text-xs">
                    No dispatches accepted/assigned.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pipeline.assigned.map((b) => (
                      <div key={b.id} className="bg-[#14141b] border border-white/5 p-3.5 rounded-xl flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase text-blue-400">
                              {b.category}
                            </span>
                            <span className="text-[10px] font-mono text-white/40">#{b.id.substring(0, 8)}</span>
                          </div>
                          <p className="text-xs font-bold text-white">Client: {b.client?.profile?.full_name || 'Client'}</p>
                          <p className="text-[10px] text-white/50">Assigned Partner: <span className="text-emerald-400 font-bold">{b.worker?.profile?.full_name || 'Worker'}</span></p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedBooking(b);
                              setModalType('reassign');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-600/10 border border-amber-600/35 hover:bg-amber-600/20 text-[10px] font-black text-amber-400 transition-colors"
                          >
                            Reassign
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBooking(b);
                              setModalType('cancel');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-red-500/20 text-[10px] font-bold text-red-400 hover:bg-red-500/5 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stage: In-Progress */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                  3. In Execution / Awaiting Completion ({pipeline.inProgress.length})
                </h4>
                {pipeline.inProgress.length === 0 ? (
                  <div className="p-3 bg-white/1 border border-dashed border-white/5 rounded-xl text-center text-white/20 text-xs">
                    No dispatches currently in progress.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pipeline.inProgress.map((b) => (
                      <div key={b.id} className="bg-[#14141b] border border-white/5 p-3.5 rounded-xl flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase text-emerald-400">
                              {b.status.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] font-mono text-white/40">#{b.id.substring(0, 8)}</span>
                          </div>
                          <p className="text-xs font-bold text-white">Client: {b.client?.profile?.full_name || 'Client'}</p>
                          <p className="text-[10px] text-white/50">Partner: <span className="text-white font-bold">{b.worker?.profile?.full_name || 'Worker'}</span></p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedBooking(b);
                              setModalType('cancel');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-red-500/20 text-[10px] font-bold text-red-400 hover:bg-red-500/5 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (40%): Live Worker Monitor & Dispatch History */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 space-y-4">
            <div className="flex border-b border-white/5">
              <button
                onClick={() => setActiveRightTab('workers')}
                className={`flex-1 py-2 text-center text-xs font-bold border-b-2 transition-colors ${
                  activeRightTab === 'workers'
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-white/50'
                }`}
              >
                Worker Monitor
              </button>
              <button
                onClick={() => setActiveRightTab('history')}
                className={`flex-1 py-2 text-center text-xs font-bold border-b-2 transition-colors ${
                  activeRightTab === 'history'
                    ? 'border-violet-500 text-violet-400'
                    : 'border-transparent text-white/50'
                }`}
              >
                Dispatch Logs
              </button>
            </div>

            {/* TAB: WORKERS MONITOR */}
            {activeRightTab === 'workers' && (
              <div className="space-y-3">
                {/* Filters */}
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      placeholder="Search workers..."
                      value={workerSearch}
                      onChange={(e) => setWorkerSearch(e.target.value)}
                      className="bg-[#14141b] border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold text-white placeholder-white/20 outline-none w-full"
                    />
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-1 text-[9px] font-black uppercase tracking-wider">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'online', label: 'Online' },
                      { id: 'busy', label: 'Busy' },
                      { id: 'offline', label: 'Offline' },
                      { id: 'suspended', label: 'Suspended' },
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        onClick={() => setWorkerStatusFilter(btn.id)}
                        className={`px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap ${
                          workerStatusFilter === btn.id
                            ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                            : 'border-white/5 text-white/40 hover:text-white/70'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Worker List */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  {filteredWorkers.map((w) => {
                    const avail = Array.isArray(w.availability) ? w.availability[0] : w.availability;
                    const status = avail?.status || 'offline';
                    const name = w.profile?.full_name || 'Worker';

                    let statusBadge = (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/40">
                        Offline
                      </span>
                    );
                    if (w.status === 'suspended') {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[8px] font-black uppercase text-red-400">
                          Suspended
                        </span>
                      );
                    } else if (status === 'online') {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[8px] font-black uppercase text-emerald-400">
                          Online
                        </span>
                      );
                    } else if (status === 'busy') {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[8px] font-black uppercase text-blue-400">
                          Busy
                        </span>
                      );
                    } else if (status === 'unavailable') {
                      statusBadge = (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[8px] font-black uppercase text-amber-400">
                          Unavailable
                        </span>
                      );
                    }

                    return (
                      <div key={w.id} className="bg-[#14141b] border border-white/5 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{name}</span>
                            {statusBadge}
                          </div>
                          <p className="text-[10px] text-white/40 capitalize">
                            {w.category} • ⭐ {w.rating_avg ? w.rating_avg.toFixed(1) : '5.0'}
                          </p>
                        </div>

                        {/* Force Unavailable override action */}
                        {w.status === 'approved' && status !== 'offline' && status !== 'unavailable' && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleWorkerOverride(w.id, 'unavailable')}
                              className="px-2 py-1 rounded bg-amber-600/10 border border-amber-600/20 hover:bg-amber-600/20 text-[9px] font-black text-amber-400 transition-colors"
                            >
                              Block
                            </button>
                            <button
                              onClick={() => handleWorkerOverride(w.id, 'suspend')}
                              className="px-2 py-1 rounded bg-red-600/10 border border-red-600/20 hover:bg-red-600/20 text-[9px] font-black text-red-400 transition-colors"
                            >
                              Suspend
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: DISPATCH HISTORY LOGS */}
            {activeRightTab === 'history' && (
              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                {dispatchHistory.length === 0 ? (
                  <div className="py-10 text-center text-white/20 text-xs font-semibold">
                    No historical logs recorded.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dispatchHistory.map((item) => (
                      <div key={item.dispatch_id} className="bg-[#14141b] border border-white/5 p-3 rounded-xl space-y-2 text-xs">
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="text-white/60">Booking #{item.booking_id.substring(0, 8)}</span>
                          <span
                            className={`uppercase font-black px-1.5 py-0.5 rounded text-[8px] ${
                              item.dispatch_status === 'accepted'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-white/5 text-white/50'
                            }`}
                          >
                            {item.dispatch_status}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-white font-semibold capitalize">Category: {item.category}</p>
                          <p className="text-white/40 text-[10px]">Attempts: {item.attempt_count} / {item.max_attempts}</p>
                          <p className="text-white/30 text-[9px]">{new Date(item.dispatched_at).toLocaleString()}</p>
                        </div>

                        {/* Nested attempts lists */}
                        {item.attempts && item.attempts.length > 0 && (
                          <div className="border-t border-white/5 pt-2 mt-2 space-y-1.5 text-[10px]">
                            {item.attempts.map((att, aIdx) => (
                              <div key={att.attempt_id} className="flex items-start gap-1 text-white/50 font-medium">
                                <CornerDownRight size={10} className="shrink-0 mt-0.5 text-violet-400/60" />
                                <div>
                                  <span className="text-violet-300 font-bold">{att.worker_name}</span>: {att.status}
                                  {att.rejection_reason && (
                                    <span className="text-red-400 font-mono text-[9px] block">({att.rejection_reason})</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* OVERLAY MODAL: Dispatch Mutations (Force Assign / Reassign / Cancel) */}
      {modalType && selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f0f13] border border-white/8 rounded-3xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                {modalType === 'cancel' ? (
                  <>
                    <XCircle size={16} className="text-red-400" /> Cancel Booking
                  </>
                ) : (
                  <>
                    <UserPlus size={16} className="text-violet-400" />{' '}
                    {modalType === 'reassign' ? 'Reassign Professional' : 'Force Assign Professional'}
                  </>
                )}
              </h3>
              <button onClick={closeModal} className="text-white/40 hover:text-white transition-colors text-xs font-bold">
                ✕
              </button>
            </div>

            {/* Read-Only Restriction Warning */}
            {isReadOnly && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-start gap-2.5 text-xs font-semibold">
                <Lock size={14} className="shrink-0 mt-0.5" />
                <span>You are currently in a read-only role and are not authorized to dispatch modifications.</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Booking Info Card */}
              <div className="bg-[#14141b] border border-white/5 p-3 rounded-xl text-xs space-y-1">
                <p className="font-bold text-white">Booking #{selectedBooking.id.substring(0, 8)}</p>
                <p className="text-white/50 capitalize">Service: {selectedBooking.category}</p>
                <p className="text-white/50">Client: {selectedBooking.client?.profile?.full_name}</p>
                {selectedBooking.worker?.profile?.full_name && (
                  <p className="text-white/50">Assigned worker: {selectedBooking.worker.profile.full_name}</p>
                )}
              </div>

              {/* Assignment worker dropdown selection */}
              {modalType !== 'cancel' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black uppercase text-white/40 tracking-widest pl-0.5">
                    Select Available Professional
                  </label>
                  <select
                    value={targetWorkerId}
                    onChange={(e) => setTargetWorkerId(e.target.value)}
                    className="bg-[#14141b] border border-white/5 rounded-xl text-xs font-bold text-white px-3 py-2.5 outline-none focus:border-violet-500/20"
                    disabled={isReadOnly}
                  >
                    <option value="">Select a professional...</option>
                    {workers
                      .filter((w) => w.category === selectedBooking.category && w.status === 'approved')
                      .map((w) => {
                        const avail = Array.isArray(w.availability) ? w.availability[0] : w.availability;
                        const status = avail?.status || 'offline';
                        return (
                          <option key={w.id} value={w.id}>
                            {w.profile?.full_name || 'Worker'} (Availability: {status})
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}

              {/* Text Area reason input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase text-white/40 tracking-widest pl-0.5">
                  Reason / Dispatch Note
                </label>
                <textarea
                  placeholder="State the administrative rationale for this manual dispatch action..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="bg-[#14141b] border border-white/5 rounded-xl text-xs font-medium text-white p-3 h-20 placeholder-white/10 outline-none focus:border-violet-500/20 w-full resize-none"
                  disabled={isReadOnly}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl border border-white/5 hover:bg-white/5 text-xs font-bold text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              {modalType === 'cancel' ? (
                <button
                  onClick={handleCancelBooking}
                  disabled={isReadOnly || !reason || refreshing}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-xs font-black text-white transition-colors"
                >
                  Confirm Cancel
                </button>
              ) : (
                <button
                  onClick={handleAssignWorker}
                  disabled={isReadOnly || !targetWorkerId || !reason || refreshing}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-xs font-black text-white transition-colors"
                >
                  Confirm Assign
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
