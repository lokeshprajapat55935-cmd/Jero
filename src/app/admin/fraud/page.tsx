'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Shield, Loader2, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const SEVERITY_CONFIG = {
  low: 'bg-white/5 text-white/30 border-white/10',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/15',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/15',
  critical: 'bg-red-500/10 text-red-400 border-red-500/15 animate-pulse',
};

const STATUS_CONFIG = {
  open: 'bg-red-500/15 text-red-400 border-red-500/20',
  dismissed: 'bg-white/5 text-white/25 border-white/10',
  escalated: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  actioned: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  suspicious_cancellation: 'Suspicious Cancellation',
  fake_booking: 'Fake Booking',
  wallet_abuse: 'Wallet Abuse',
  otp_failure_pattern: 'OTP Failure Pattern',
  repeated_disputes: 'Repeated Disputes',
  account_sharing: 'Account Sharing',
  other: 'Other',
};

export default function FraudPage() {
  const { toast } = useToast();
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100', status: statusFilter });
      const res = await fetch(`/api/admin/fraud?${params}`);
      const json = await res.json();
      setFlags(json.data?.flags || []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const action = async (flagId: string, actionType: 'dismiss' | 'escalate' | 'action') => {
    if (!reviewNote.trim() || reviewNote.trim().length < 5) {
      toast({ title: 'Review note required (min 5 chars)' }); return;
    }
    setActioning(flagId);
    try {
      const res = await fetch('/api/admin/fraud', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag_id: flagId, action: actionType, review_note: reviewNote }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Flag updated', description: `Action: ${actionType}` });
      setReviewNote('');
      setExpanded(null);
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Security</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Shield size={20} className="text-violet-400" /> Fraud Monitor
          </h1>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-white/8 overflow-x-auto">
        {['open', 'escalated', 'actioned', 'dismissed', 'all'].map((s) => (
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
            {s}
          </button>
        ))}
      </div>

      {/* Flags */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 size={24} className="animate-spin text-violet-400" />
          <p className="text-white/40 text-sm font-bold">Loading fraud flags...</p>
        </div>
      ) : flags.length === 0 ? (
        <div className="text-center py-16">
          <Shield size={36} className="mx-auto text-emerald-500/30 mb-3" />
          <p className="text-white/30 font-bold">No fraud flags in this category</p>
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((f) => {
            const isExpanded = expanded === f.id;
            const sevCfg = SEVERITY_CONFIG[f.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.low;
            const stCfg = STATUS_CONFIG[f.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;

            return (
              <div key={f.id} className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
                <button
                  className="w-full px-5 py-4 flex items-start justify-between gap-4 hover:bg-white/3 transition-colors text-left"
                  onClick={() => setExpanded(isExpanded ? null : f.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={cn('px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase', sevCfg)}>
                        {f.severity}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase', stCfg)}>
                        {f.status}
                      </span>
                      <span className="text-[9px] text-white/30 font-bold">
                        {FLAG_TYPE_LABELS[f.flag_type] || f.flag_type}
                      </span>
                    </div>
                    <p className="text-xs font-black text-white">
                      {f.user?.full_name || 'Unknown User'} · {f.user?.role}
                    </p>
                    <p className="text-[10px] text-white/30 font-semibold mt-0.5 line-clamp-1">
                      {f.description}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-white/25 font-semibold">
                      {new Date(f.created_at).toLocaleDateString('en-IN')}
                    </p>
                    {isExpanded ? (
                      <ChevronUp size={13} className="text-white/20 mt-1 ml-auto" />
                    ) : (
                      <ChevronDown size={13} className="text-white/20 mt-1 ml-auto" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/8 px-5 py-4 space-y-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-white/20 mb-1">Full Description</p>
                      <p className="text-xs text-white/50 font-medium">{f.description}</p>
                    </div>

                    {/* User info */}
                    <div className="bg-white/3 rounded-xl p-3">
                      <p className="text-[9px] font-black uppercase tracking-wider text-white/20 mb-1">Flagged User</p>
                      <p className="text-xs font-black text-white">{f.user?.full_name}</p>
                      <p className="text-[10px] text-white/30">{f.user?.phone} · {f.user?.email}</p>
                    </div>

                    {/* Related booking */}
                    {f.booking && (
                      <div className="bg-white/3 rounded-xl p-3">
                        <p className="text-[9px] font-black uppercase tracking-wider text-white/20 mb-1">Related Booking</p>
                        <p className="text-xs text-white/60 font-mono">#{f.booking.id?.slice(0, 16)}</p>
                        <p className="text-[10px] text-white/30 capitalize">{f.booking.status} · ₹{f.booking.total_price}</p>
                      </div>
                    )}

                    {/* Evidence */}
                    {f.evidence && Object.keys(f.evidence).length > 0 && (
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-white/20 mb-1">Evidence</p>
                        <pre className="text-[10px] text-white/40 font-mono bg-white/3 rounded-xl p-3 overflow-auto">
                          {JSON.stringify(f.evidence, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Action buttons (only for open/escalated) */}
                    {['open', 'escalated'].includes(f.status) && (
                      <div className="border-t border-white/8 pt-4 space-y-3">
                        <p className="text-[9px] font-black uppercase tracking-wider text-white/20">Review Action</p>
                        <textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Review note (required — will be logged)..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs text-white placeholder-white/20 font-medium focus:outline-none focus:border-violet-500/50 min-h-[70px] resize-none"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => action(f.id, 'action')}
                            disabled={!!actioning}
                            className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/20 text-red-400 text-[10px] font-black hover:bg-red-500/25 transition-all disabled:opacity-50"
                          >
                            Take Action (Suspend User)
                          </button>
                          <button
                            onClick={() => action(f.id, 'escalate')}
                            disabled={!!actioning}
                            className="px-3 py-2 rounded-xl bg-purple-500/15 border border-purple-500/20 text-purple-400 text-[10px] font-black hover:bg-purple-500/25 transition-all disabled:opacity-50"
                          >
                            Escalate
                          </button>
                          <button
                            onClick={() => action(f.id, 'dismiss')}
                            disabled={!!actioning}
                            className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/30 text-[10px] font-black hover:text-white/60 hover:bg-white/8 transition-all disabled:opacity-50"
                          >
                            Dismiss
                          </button>
                          {actioning === f.id && <Loader2 size={14} className="animate-spin text-white/40 mt-2" />}
                        </div>
                      </div>
                    )}

                    {/* Review result (if reviewed) */}
                    {f.review_note && (
                      <div className="border-t border-white/8 pt-4">
                        <p className="text-[9px] font-black uppercase tracking-wider text-white/20 mb-1">Review Note</p>
                        <p className="text-xs text-white/50 font-medium">{f.review_note}</p>
                        <p className="text-[9px] text-white/20 font-semibold mt-1">
                          by {f.reviewer?.full_name} · {f.reviewed_at && new Date(f.reviewed_at).toLocaleString('en-IN')}
                        </p>
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
