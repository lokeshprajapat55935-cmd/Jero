'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { LiveStatCard } from '@/components/admin/LiveStatCard';
import {
  Activity,
  Wrench,
  IndianRupee,
  AlertTriangle,
  CreditCard,
  Calendar,
  Radio,
  RefreshCw,
  Loader2,
  TrendingUp,
  Clock,
  CheckCircle2,
  Zap,
  Wallet,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface LiveData {
  snapshot: {
    active_bookings: number;
    online_workers: number;
    open_disputes: number;
    failed_payments_24h: number;
    today_revenue: number;
    today_bookings: number;
    broadcasting_bookings: number;
    failed_dispatches?: number;
    active_dispatches?: number;
    total_customers?: number;
    total_workers?: number;
    pending_withdrawals?: number;
    month_revenue?: number;
    platform_commission?: number;
    cancelled_today?: number;
    pending_approvals?: number;
  };
  active_bookings: any[];
  online_workers: any[];
  recent_activity: any[];
  active_dispatches?: any[];
}

function DispatchMap({
  workers,
  bookings,
  dispatches,
}: {
  workers: any[];
  bookings: any[];
  dispatches: any[];
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [hoveredEntity, setHoveredEntity] = useState<any | null>(null);

  // Bhilwara center as base coordinate mapping reference
  const baseLat = 25.3407;
  const baseLng = 74.6366;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas with dark slate grid background
    ctx.fillStyle = '#0f0f13';
    ctx.fillRect(0, 0, width, height);

    // Draw coordinate grids
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Haversine screen coordinates mapper (+/- 0.08 degrees around center)
    const range = 0.08;
    const toXY = (lat: number, lng: number) => {
      const x = ((lng - baseLng) / range + 0.5) * width;
      const y = (0.5 - (lat - baseLat) / range) * height;
      return { x, y };
    };

    // 1. Draw heatmaps for online worker density
    workers.forEach((w) => {
      const loc = w.location;
      if (loc?.latitude && loc?.longitude) {
        const { x, y } = toXY(Number(loc.latitude), Number(loc.longitude));
        const gradient = ctx.createRadialGradient(x, y, 2, x, y, 45);
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, 45, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 2. Draw broadcasting search circles
    dispatches.forEach((d) => {
      const loc = d.booking;
      if (loc?.latitude && loc?.longitude) {
        const { x, y } = toXY(Number(loc.latitude), Number(loc.longitude));
        const radiusPx = (Number(d.current_radius_km) / 15) * width * 0.18;

        ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(59, 130, 246, 0.02)';
        ctx.beginPath();
        ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 3. Draw active client bookings
    bookings.forEach((b) => {
      if (b.latitude && b.longitude) {
        const { x, y } = toXY(Number(b.latitude), Number(b.longitude));

        ctx.fillStyle = '#3b82f6';
        ctx.shadowColor = '#3b82f6';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // 4. Draw online/offline/busy/unavailable workers
    workers.forEach((w) => {
      const loc = w.location;
      if (loc?.latitude && loc?.longitude) {
        const { x, y } = toXY(Number(loc.latitude), Number(loc.longitude));
        const status = w.availability?.status || w.availabilityDb?.status || 'offline';

        const color = status === 'online' ? '#10b981' : status === 'busy' ? '#f59e0b' : '#ef4444';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }, [workers, bookings, dispatches]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const baseLat = 25.3407;
    const baseLng = 74.6366;
    const range = 0.08;
    const width = rect.width;
    const height = rect.height;

    const toXY = (lat: number, lng: number) => {
      const ex = ((lng - baseLng) / range + 0.5) * width;
      const ey = (0.5 - (lat - baseLat) / range) * height;
      return { x: ex, y: ey };
    };

    let found: any = null;
    for (const w of workers) {
      const loc = w.location;
      if (loc?.latitude && loc?.longitude) {
        const pt = toXY(Number(loc.latitude), Number(loc.longitude));
        const dist = Math.hypot(pt.x - x, pt.y - y);
        if (dist < 10) {
          found = {
            type: 'worker',
            name: w.profile?.full_name || 'Worker',
            category: w.category,
            status: w.availability?.status || w.availabilityDb?.status || 'offline',
          };
          break;
        }
      }
    }

    if (!found) {
      for (const b of bookings) {
        if (b.latitude && b.longitude) {
          const pt = toXY(Number(b.latitude), Number(b.longitude));
          const dist = Math.hypot(pt.x - x, pt.y - y);
          if (dist < 10) {
            found = {
              type: 'booking',
              name: b.client?.profile?.full_name || 'Client',
              category: b.category,
              status: b.status,
              price: b.total_price,
            };
            break;
          }
        }
      }
    }

    setHoveredEntity(found);
  };

  return (
    <div className="relative border border-white/8 rounded-2xl overflow-hidden bg-[#0f0f13] h-[340px]">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredEntity(null)}
      />
      <div className="absolute top-4 left-4 bg-[#141419]/90 border border-white/10 rounded-xl p-3.5 backdrop-blur-md text-[10px] font-bold text-white/60 space-y-2 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Online Workers ({workers.filter(w => (w.availability?.status || w.availabilityDb?.status) === 'online').length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span>Busy Workers ({workers.filter(w => (w.availability?.status || w.availabilityDb?.status) === 'busy').length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <span>Active Bookings ({bookings.length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-400" />
          <span>Search Radii ({dispatches.length})</span>
        </div>
      </div>

      {hoveredEntity && (
        <div className="absolute bottom-4 right-4 bg-[#141419]/90 border border-white/15 rounded-xl p-3 backdrop-blur-md text-xs font-bold text-white max-w-[200px] pointer-events-none">
          <p className="text-[10px] text-white/40 uppercase tracking-widest">{hoveredEntity.type}</p>
          <p className="text-white mt-1">{hoveredEntity.name}</p>
          <p className="text-white/60 mt-0.5 text-[11px] capitalize">{hoveredEntity.category} · {hoveredEntity.status}</p>
          {hoveredEntity.price && <p className="text-violet-400 mt-1">₹{hoveredEntity.price}</p>}
        </div>
      )}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  broadcasting: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  accepted: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  arrived: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  in_progress: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  awaiting_otp: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  otp_verified: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  awaiting_payment: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  payment_processing: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  payment_verified: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  paid_completed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/20',
  disputed: 'bg-red-600/15 text-red-500 border-red-600/20',
};

const POLL_INTERVAL = 12_000; // 12 seconds

export default function LiveOpsDashboard() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(POLL_INTERVAL / 1000);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/live');
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        setLastRefresh(new Date());
        setCountdown(POLL_INTERVAL / 1000);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    
    // Fallback polling
    const interval = setInterval(() => load(), POLL_INTERVAL);
    
    // Supabase Realtime Enterprise Subscription
    const supabase = createClient();
    const channel = supabase
      .channel('admin_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_logs' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_requests' }, () => load())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!lastRefresh) return;
    const tick = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [lastRefresh]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-12 w-12 rounded-2xl bg-violet-500/15 flex items-center justify-center">
          <Activity size={24} className="text-violet-400 animate-pulse" />
        </div>
        <p className="text-white/40 font-bold text-sm">Loading live platform data...</p>
      </div>
    );
  }

  const snap = data?.snapshot;
  const activeBookings = data?.active_bookings || [];
  const recentActivity = data?.recent_activity || [];

  // Build booking pipeline
  const pipeline = [
    { label: 'Broadcasting', status: 'broadcasting', count: snap?.broadcasting_bookings || 0, color: 'violet' as const },
    { label: 'Accepted', status: 'accepted', count: activeBookings.filter(b => b.status === 'accepted').length, color: 'emerald' as const },
    { label: 'In Progress', status: 'in_progress', count: activeBookings.filter(b => b.status === 'in_progress').length, color: 'amber' as const },
    { label: 'Awaiting OTP', status: 'awaiting_otp', count: activeBookings.filter(b => b.status === 'awaiting_otp' || b.status === 'otp_verified').length, color: 'blue' as const },
    { label: 'Payment', status: 'awaiting_payment', count: activeBookings.filter(b => b.status === 'awaiting_payment' || b.status === 'payment_processing').length, color: 'cyan' as const },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-[11px] font-black uppercase tracking-widest text-white/40">Real-time</p>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Live Operations</h1>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <p className="text-[11px] text-white/30 font-semibold">
              Next refresh in <span className="text-white/50 font-black">{countdown}s</span>
            </p>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/8 transition-all text-xs font-bold disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stat Cards Row 1: Bookings & Dispatch */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-3">
        <LiveStatCard
          label="Active Bookings"
          value={snap?.active_bookings ?? 0}
          subtitle="Live ongoing jobs"
          icon={Calendar}
          color="violet"
          pulse={!!snap?.active_bookings}
        />
        <LiveStatCard
          label="Broadcasting"
          value={snap?.broadcasting_bookings ?? 0}
          subtitle="Searching for workers"
          icon={Radio}
          color="blue"
          pulse={!!snap?.broadcasting_bookings}
        />
        <LiveStatCard
          label="Completed Today"
          value={snap?.today_bookings ?? 0}
          subtitle="Successfully finished"
          icon={CheckCircle2}
          color="emerald"
        />
        <LiveStatCard
          label="Cancelled Today"
          value={snap?.cancelled_today ?? 0}
          subtitle="Dropped bookings"
          icon={AlertTriangle}
          color={snap?.cancelled_today ? 'red' : 'emerald'}
        />
      </div>

      {/* Stat Cards Row 2: Users & Operations */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-3">
        <LiveStatCard
          label="Online Workers"
          value={snap?.online_workers ?? 0}
          subtitle="Idle & Ready"
          icon={Activity}
          color="emerald"
        />
        <LiveStatCard
          label="Total Workers"
          value={(snap?.total_workers ?? 0).toLocaleString()}
          subtitle="Platform professionals"
          icon={Wrench}
          color="violet"
        />
        <LiveStatCard
          label="Total Customers"
          value={(snap?.total_customers ?? 0).toLocaleString()}
          subtitle="Registered clients"
          icon={Users}
          color="cyan"
        />
        <LiveStatCard
          label="Pending Approvals"
          value={snap?.pending_approvals ?? 0}
          subtitle="Workers awaiting KYC"
          icon={AlertTriangle}
          color={snap?.pending_approvals ? 'amber' : 'emerald'}
          pulse={!!snap?.pending_approvals}
        />
      </div>

      {/* Stat Cards Row 2: Finance & Errors */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        <LiveStatCard
          label="Today Revenue"
          value={`₹${(snap?.today_revenue ?? 0).toLocaleString('en-IN')}`}
          subtitle={`${snap?.today_bookings ?? 0} completions today`}
          icon={IndianRupee}
          color="emerald"
        />
        <LiveStatCard
          label="Month Revenue"
          value={`₹${(snap?.month_revenue ?? 0).toLocaleString('en-IN')}`}
          subtitle="Gross Volume"
          icon={TrendingUp}
          color="emerald"
        />
        <LiveStatCard
          label="Platform Commission"
          value={`₹${(snap?.platform_commission ?? 0).toLocaleString('en-IN')}`}
          subtitle="Net Revenue"
          icon={CreditCard}
          color="cyan"
        />
        <LiveStatCard
          label="Pending Withdrawals"
          value={snap?.pending_withdrawals ?? 0}
          subtitle="Payout requests"
          icon={Wallet}
          color={snap?.pending_withdrawals ? 'amber' : 'emerald'}
        />
        <LiveStatCard
          label="Open Disputes"
          value={snap?.open_disputes ?? 0}
          subtitle="Needs review"
          icon={AlertTriangle}
          color={snap?.open_disputes ? 'red' : 'emerald'}
          pulse={!!snap?.open_disputes}
        />
        <LiveStatCard
          label="Failed Payments"
          value={snap?.failed_payments_24h ?? 0}
          subtitle="Last 24 hours"
          icon={CreditCard}
          color={snap?.failed_payments_24h ? 'red' : 'emerald'}
        />
      </div>


      {/* Booking Pipeline */}
      <div className="rounded-2xl bg-white/3 border border-white/8 p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-violet-400" />
          <h2 className="text-sm font-black text-white uppercase tracking-wider">Booking Pipeline</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {pipeline.map((stage) => (
            <div key={stage.status} className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
              <p className={cn('text-2xl font-black',
                stage.count > 0 ? 'text-white' : 'text-white/20'
              )}>
                {stage.count}
              </p>
              <p className="text-[10px] text-white/40 font-bold mt-1">{stage.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Dispatch Map Visualizer */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-violet-400" />
          <h2 className="text-sm font-black text-white uppercase tracking-wider">Live Dispatch Tracker & Heatmap</h2>
        </div>
        <DispatchMap
          workers={data?.online_workers || []}
          bookings={data?.active_bookings || []}
          dispatches={data?.active_dispatches || []}
        />
      </div>

      {/* Two-column: Active Bookings + Recent Activity */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Active Bookings Feed */}
        <div className="rounded-2xl bg-white/3 border border-white/8 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-violet-400 animate-pulse" />
              <h2 className="text-xs font-black text-white uppercase tracking-wider">Active Bookings</h2>
            </div>
            <Link
              href="/admin/bookings"
              className="text-[10px] text-violet-400 font-black hover:text-violet-300 transition-colors"
            >
              View All →
            </Link>
          </div>
          <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
            {activeBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 size={28} className="text-emerald-500/40" />
                <p className="text-xs text-white/30 font-bold">No active bookings right now</p>
              </div>
            ) : (
              activeBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="px-5 py-3.5 hover:bg-white/3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase border',
                            STATUS_COLORS[booking.status] || 'bg-white/10 text-white/40 border-white/10'
                          )}
                        >
                          {booking.status.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] text-white/30 font-semibold capitalize">
                          {booking.category?.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-white/60 font-semibold font-mono truncate">
                        #{booking.id?.slice(0, 12)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-white">
                        ₹{Number(booking.total_price || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-white/30 font-semibold mt-0.5">
                        {new Date(booking.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="rounded-2xl bg-white/3 border border-white/8 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-amber-400" />
              <h2 className="text-xs font-black text-white uppercase tracking-wider">Platform Activity</h2>
            </div>
          </div>
          <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Clock size={28} className="text-white/10" />
                <p className="text-xs text-white/30 font-bold">No recent activity</p>
              </div>
            ) : (
              recentActivity.map((booking) => (
                <div
                  key={booking.id}
                  className="px-5 py-3.5 hover:bg-white/3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-7 w-7 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center shrink-0">
                      <Calendar size={12} className="text-white/30" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white/70 font-bold truncate">
                        {booking.client?.profile?.full_name || 'Client'} →{' '}
                        {booking.worker?.profile?.full_name || 'Worker'}
                      </p>
                      <p className="text-[10px] text-white/30 font-semibold mt-0.5 capitalize">
                        {booking.category?.replace(/_/g, ' ')} · {booking.worker?.category || ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase border',
                          STATUS_COLORS[booking.status] || 'bg-white/10 text-white/40 border-white/10'
                        )}
                      >
                        {booking.status?.replace(/_/g, ' ')}
                      </span>
                      <p className="text-[10px] text-white/25 font-semibold mt-1">
                        {new Date(booking.updated_at || booking.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
