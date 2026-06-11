'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { BookingTimeline } from '@/components/admin/BookingTimeline';
import { AlertTriangle, Loader2, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, XCircle, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Dispute } from '@/types';

const STATUS_CONFIG = {
  open: { label: 'Open', classes: 'bg-red-500/15 text-red-400 border-red-500/20' },
  under_review: { label: 'Under Review', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  resolved_client: { label: 'Resolved (Client)', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  resolved_worker: { label: 'Resolved (Worker)', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  escalated: { label: 'Escalated', classes: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  closed: { label: 'Closed', classes: 'bg-white/5 text-white/30 border-white/10' },
};

const PRIORITY_CONFIG = {
  low: 'bg-white/5 text-white/30 border-white/8',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/15',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/15',
  critical: 'bg-red-500/10 text-red-400 border-red-500/15',
};

export default function DisputesPage() {
  const { toast } = useToast();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/admin/disputes?${params}`);
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      setDisputes(json.data?.disputes || []);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (disputeId: string, action: string) => {
    if (!resolutionNote.trim() || resolutionNote.trim().length < 5) {
      toast({ title: 'Resolution note required (min 5 chars)' }); return;
    }
    setResolving(disputeId);
    try {
      const res = await fetch('/api/admin/disputes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispute_id: disputeId, action, resolution_note: resolutionNote }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Dispute updated', description: `Action: ${action}` });
      setResolutionNote('');
      setExpanded(null);
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Operations</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <AlertTriangle size={20} className="text-amber-400" /> Dispute Center
          </h1>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-white/8 overflow-x-auto">
        {['all', 'open', 'under_review', 'escalated', 'resolved_client', 'resolved_worker', 'closed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3.5 py-2 text-[10px] font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap -mb-px',
              statusFilter === s
                ? 'border-violet-400 text-violet-400'
                : 'border-transparent text-white/30 hover:text-white/60'
            )}
          >
            {s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 size={24} className="animate-spin text-violet-400" />
          <p className="text-white/40 text-sm font-bold">Loading disputes...</p>
        </div>
      ) : disputes.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 size={36} className="mx-auto text-emerald-500/30 mb-3" />
          <p className="text-white/30 font-bold">No disputes found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => {
            const isExpanded = expanded === d.id;
            const statusCfg = STATUS_CONFIG[d.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;
            const priorityCfg = PRIORITY_CONFIG[d.priority as keyof typeof PRIORITY_CONFIG] || PRIORITY_CONFIG.low;

            return (
              <div key={d.id} className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                {/* Header row */}
                <button
                  className="w-full px-5 py-4 flex items-start justify-between gap-4 hover:bg-white/3 transition-colors text-left"
                  onClick={() => setExpanded(isExpanded ? null : d.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={cn('px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase', statusCfg.classes)}>
                        {statusCfg.label}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase', priorityCfg)}>
                        {d.priority}
                      </span>
                      <span className="text-[9px] text-white/30 font-bold capitalize">
                        {d.dispute_type?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-black text-white">{d.title}</p>
                    <p className="text-[10px] text-white/30 font-semibold mt-1">
                      Raised by: {d.raiser?.full_name || 'Unknown'} ·{' '}
                      {new Date(d.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-white/30 shrink-0 mt-1" />
                  ) : (
                    <ChevronDown size={16} className="text-white/30 shrink-0 mt-1" />
                  )}
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-white/8 px-5 py-4 space-y-4">
                    {/* Description */}
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-1">Description</p>
                      <p className="text-xs text-white/60 font-medium">{d.description}</p>
                    </div>

                    {/* Parties */}
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="bg-white/3 rounded-xl p-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-1">Raised By</p>
                        <p className="text-xs font-black text-white">{d.raiser?.full_name || 'N/A'}</p>
                        <p className="text-[10px] text-white/30">{d.raiser?.phone} · {d.raiser?.role}</p>
                      </div>
                      {d.against && (
                        <div className="bg-white/3 rounded-xl p-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-1">Raised Against</p>
                          <p className="text-xs font-black text-white">{d.against?.full_name || 'N/A'}</p>
                          <p className="text-[10px] text-white/30">{d.against?.phone} · {d.against?.role}</p>
                        </div>
                      )}
                    </div>

                    {/* Booking Timeline */}
                    {d.booking?.timeline && d.booking.timeline.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-3">Booking Timeline</p>
                        <BookingTimeline timeline={d.booking.timeline} />
                      </div>
                    )}

                    {/* Booking info */}
                    {d.booking && (
                      <div className="bg-white/3 border border-white/8 rounded-xl p-3 grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-[9px] text-white/30 font-bold uppercase">Amount</p>
                          <p className="text-sm font-black text-white mt-0.5">₹{Number(d.booking.total_price || 0).toLocaleString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-white/30 font-bold uppercase">Payment</p>
                          <p className="text-xs font-black text-white/70 mt-0.5 capitalize">{d.booking.payment_method || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-white/30 font-bold uppercase">Status</p>
                          <p className="text-xs font-black text-amber-400 mt-0.5 capitalize">{d.booking.status?.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                    )}

                    {/* Resolution (if active dispute) */}
                    {['open', 'under_review', 'escalated'].includes(d.status) && (
                      <div className="border-t border-white/8 pt-4 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/30">Resolve Dispute</p>
                        <textarea
                          value={resolutionNote}
                          onChange={(e) => setResolutionNote(e.target.value)}
                          placeholder="Resolution note (required — will be logged in audit trail)..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-white/20 font-medium focus:outline-none focus:border-violet-500/50 min-h-[70px] resize-none"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => resolve(d.id, 'resolve_client')}
                            disabled={!!resolving}
                            className="px-3 py-2 rounded-xl bg-blue-500/15 border border-blue-500/20 text-blue-400 text-[10px] font-black hover:bg-blue-500/25 transition-all disabled:opacity-50"
                          >
                            Resolve → Favour Client
                          </button>
                          <button
                            onClick={() => resolve(d.id, 'resolve_worker')}
                            disabled={!!resolving}
                            className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-[10px] font-black hover:bg-emerald-500/25 transition-all disabled:opacity-50"
                          >
                            Resolve → Favour Worker
                          </button>
                          <button
                            onClick={() => resolve(d.id, 'escalate')}
                            disabled={!!resolving}
                            className="px-3 py-2 rounded-xl bg-purple-500/15 border border-purple-500/20 text-purple-400 text-[10px] font-black hover:bg-purple-500/25 transition-all disabled:opacity-50"
                          >
                            Escalate
                          </button>
                          <button
                            onClick={() => resolve(d.id, 'close')}
                            disabled={!!resolving}
                            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 text-[10px] font-black hover:bg-white/8 transition-all disabled:opacity-50"
                          >
                            Close
                          </button>
                          {resolving === d.id && <Loader2 size={14} className="animate-spin text-white/40 mt-2" />}
                        </div>
                      </div>
                    )}

                    {/* Resolution note (if resolved) */}
                    {d.resolution_note && (
                      <div className="border-t border-white/8 pt-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-1">Resolution Note</p>
                        <p className="text-xs text-white/60 font-medium">{d.resolution_note}</p>
                        {d.resolver && (
                          <p className="text-[10px] text-white/25 font-semibold mt-1">
                            By: {d.resolver.full_name} · {d.resolved_at && new Date(d.resolved_at).toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
