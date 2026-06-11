'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  Users,
  Wrench,
  AlertTriangle,
  Radio,
  RefreshCw,
  Zap,
  CheckCircle,
  FileText,
  AlertOctagon,
  Clock,
  UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import logger from '@/lib/logger';

interface LiveData {
  snapshot: {
    active_bookings: number;
    online_workers: number;
    open_disputes: number;
    failed_payments_24h: number;
    today_revenue: number;
    today_bookings: number;
    broadcasting_bookings: number;
    failed_dispatches: number;
    active_dispatches: number;
  };
  active_bookings: any[];
  online_workers: any[];
  recent_activity: any[];
  active_dispatches: any[];
}

export default function BetaOperationsDashboard() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Incident form state
  const [eventType, setEventType] = useState('ops_disruption');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [userId, setUserId] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState('');

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/admin/live');
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (err) {
      logger.error('Failed to load live ops data inside beta dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => loadData(), 12000);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleReportIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setReporting(true);
    setReportSuccess(false);
    setReportError('');

    try {
      const payload: Record<string, any> = {
        event_type: eventType,
        severity,
        description,
      };

      if (bookingId.trim()) payload.booking_id = bookingId.trim();
      if (userId.trim()) payload.user_id = userId.trim();

      const res = await fetch('/api/admin/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setReportSuccess(true);
        setDescription('');
        setBookingId('');
        setUserId('');
        // Reload dashboard
        loadData(true);
      } else {
        setReportError(result.error || 'Failed to submit incident report');
      }
    } catch (err) {
      setReportError('Network failure. Please try again.');
    } finally {
      setReporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Activity size={28} className="text-violet-400 animate-spin" />
        <p className="text-white/40 font-bold text-sm">Loading Beta Operations Center...</p>
      </div>
    );
  }

  const snap = data?.snapshot;
  const workers = data?.online_workers || [];
  const bookings = data?.active_bookings || [];
  const dispatches = data?.active_dispatches || [];
  const recent = data?.recent_activity || [];

  const totalActions = (snap?.today_bookings || 0) + (snap?.failed_dispatches || 0);
  const dispatchSuccessRate = totalActions > 0 
    ? Math.round(((snap?.today_bookings || 0) / totalActions) * 100) 
    : 100;

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
            <p className="text-[11px] font-black uppercase tracking-widest text-violet-400">Beta Launch Operations</p>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Beta Control & Incident Center</h1>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/8 transition-all text-xs font-bold disabled:opacity-50 self-start sm:self-center"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Force Refresh'}
        </button>
      </div>

      {/* Stats Board */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 border border-violet-500/20 rounded-2xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Active Bookings</p>
              <h3 className="text-3xl font-black text-white mt-1.5">{snap?.active_bookings}</h3>
            </div>
            <div className="p-2.5 bg-violet-500/10 rounded-xl text-violet-400">
              <Zap size={20} className="animate-pulse" />
            </div>
          </div>
        </div>

        <div className="p-5 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 rounded-2xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Online Workers</p>
              <h3 className="text-3xl font-black text-white mt-1.5">{snap?.online_workers}</h3>
            </div>
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
              <UserCheck size={20} />
            </div>
          </div>
        </div>

        <div className="p-5 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 rounded-2xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Dispatch Success</p>
              <h3 className="text-3xl font-black text-white mt-1.5">{dispatchSuccessRate}%</h3>
            </div>
            <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400">
              <Radio size={20} />
            </div>
          </div>
        </div>

        <div className="p-5 bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-2xl">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white/40 text-xs font-bold uppercase tracking-wider">Open Disputes</p>
              <h3 className="text-3xl font-black text-white mt-1.5">{snap?.open_disputes}</h3>
            </div>
            <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400">
              <AlertTriangle size={20} />
            </div>
          </div>
        </div>
      </div>

      {/* Main grids layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns (Monitoring List) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dispatch queues list */}
          <div className="p-5 bg-[#0f0f13] border border-white/8 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                <Radio size={16} className="text-violet-400" />
                Live Dispatch Queue ({dispatches.length})
              </h2>
            </div>
            {dispatches.length === 0 ? (
              <p className="text-xs text-white/30 py-6 text-center font-bold">No active broadcasting search attempts.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="text-white/40 border-b border-white/8">
                      <th className="pb-2 font-bold">Booking Category</th>
                      <th className="pb-2 font-bold">Address</th>
                      <th className="pb-2 font-bold">Current Radius</th>
                      <th className="pb-2 font-bold">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispatches.map((d) => (
                      <tr key={d.id} className="border-b border-white/5 hover:bg-white/2 text-white/80">
                        <td className="py-3 font-semibold">{d.booking?.category}</td>
                        <td className="py-3 truncate max-w-[150px]">{d.booking?.location_address}</td>
                        <td className="py-3">{d.current_radius_km} km</td>
                        <td className="py-3 text-white/40 font-mono">
                          {Math.round((Date.now() - new Date(d.created_at).getTime()) / 60000)}m ago
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Active Workers overview */}
          <div className="p-5 bg-[#0f0f13] border border-white/8 rounded-2xl space-y-4">
            <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
              <Wrench size={16} className="text-emerald-400" />
              Online Available Workers ({workers.length})
            </h2>
            {workers.length === 0 ? (
              <p className="text-xs text-white/30 py-6 text-center font-bold">No workers are currently online.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {workers.map((w) => (
                  <div key={w.id} className="p-3 bg-white/3 border border-white/8 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">ID: {w.id.substring(0, 8)}...</p>
                      <p className="text-[10px] text-white/40 font-semibold">{w.category} · Area: {w.area_id?.substring(0, 8) || 'Bhilwara Core'}</p>
                    </div>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-500/10">
                      <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                      Online
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent booking timelines */}
          <div className="p-5 bg-[#0f0f13] border border-white/8 rounded-2xl space-y-4">
            <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
              <Clock size={16} className="text-blue-400" />
              Live Booking Pipelines ({bookings.length})
            </h2>
            {bookings.length === 0 ? (
              <p className="text-xs text-white/30 py-6 text-center font-bold">No active bookings to trace.</p>
            ) : (
              <div className="space-y-2">
                {bookings.map((b) => (
                  <div key={b.id} className="p-3 bg-white/2 border border-white/5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{b.category}</span>
                        <span className="text-[10px] text-white/30">ID: {b.id.substring(0, 8)}...</span>
                      </div>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        Client: {b.client?.profile?.full_name || 'Anonymous'} · Provider: {b.worker?.profile?.full_name || 'Unassigned'}
                      </p>
                    </div>
                    <span className="self-start sm:self-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-400/15 text-violet-300 border border-violet-400/20">
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Incident center logger form */}
        <div className="space-y-6">
          <div className="p-5 bg-gradient-to-br from-red-500/10 to-[#140b0b]/20 border border-red-500/20 rounded-2xl space-y-4">
            <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
              <AlertOctagon size={16} className="text-red-400 animate-pulse" />
              Incident Reporting System
            </h2>
            <p className="text-[11px] text-white/40 leading-relaxed font-semibold">
              Log client/worker complaints, network errors, payment failures, or location spoof issues directly into audit logs.
            </p>

            <form onSubmit={handleReportIncident} className="space-y-3.5 pt-2">
              <div>
                <label className="block text-[10px] font-black uppercase text-white/40 tracking-wider mb-1.5">Incident Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full bg-[#141419] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/40"
                >
                  <option value="ops_disruption">Operational Disruption</option>
                  <option value="app_bug">Application / System Bug</option>
                  <option value="dispatch_failure">Worker Dispatch Issue</option>
                  <option value="wallet_abuse">Wallet / Payment Dispute</option>
                  <option value="other">Other Incident</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-white/40 tracking-wider mb-1.5">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full bg-[#141419] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500/40"
                >
                  <option value="info">Info</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-white/40 tracking-wider mb-1.5">Target Booking ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                  className="w-full bg-[#141419] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-red-500/40"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-white/40 tracking-wider mb-1.5">Target Profile ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. user or worker uuid"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full bg-[#141419] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-red-500/40"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-white/40 tracking-wider mb-1.5">Incident Description</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide precise details of the issue..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#141419] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-red-500/40 resize-none"
                />
              </div>

              {reportSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                  <CheckCircle size={14} />
                  Incident logged successfully in security logs.
                </div>
              )}

              {reportError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
                  <AlertOctagon size={14} />
                  {reportError}
                </div>
              )}

              <button
                type="submit"
                disabled={reporting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all disabled:opacity-50"
              >
                {reporting ? 'Submitting...' : 'Log Incident Report'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
