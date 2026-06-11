'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookingTimeline } from '@/components/admin/BookingTimeline';
import {
  ArrowLeft, Wrench, Wallet, CheckCircle2, XCircle, AlertTriangle,
  UserCheck, Ban, UserX, Star, Loader2, Eye, IndianRupee,
  TrendingDown, TrendingUp, FileText, Phone, Mail, Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  pending: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  under_review: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  rejected: 'bg-red-500/15 text-red-400 border-red-500/25',
  suspended: 'bg-red-600/15 text-red-500 border-red-600/25',
};

const BOOKING_STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-400',
  paid_completed: 'text-emerald-500',
  cancelled: 'text-red-400',
  disputed: 'text-red-500',
  in_progress: 'text-amber-400',
  accepted: 'text-blue-400',
  pending: 'text-white/40',
  broadcasting: 'text-violet-400',
};

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'wallet' | 'disputes'>('overview');
  const [moderating, setModerating] = useState(false);
  const [moderationNote, setModerationNote] = useState('');
  const [selectedBookingTimeline, setSelectedBookingTimeline] = useState<any>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/admin/workers/${id}`);
      if (!res.ok) { router.push('/admin/workers'); return; }
      const json = await res.json();
      setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const moderate = async (action: string) => {
    setModerating(true);
    try {
      const statusMap: Record<string, string> = { approve: 'approved', reject: 'rejected', suspend: 'suspended', reactivate: 'approved' };
      const res = await fetch('/api/admin/workers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: id,
          status: statusMap[action],
          verified: action === 'approve' || action === 'reactivate',
          moderation_note: moderationNote.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Failed');
      toast({ title: 'Action applied', description: `Worker ${action}d successfully.` });
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setModerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3">
        <Loader2 size={24} className="animate-spin text-violet-400" />
        <p className="text-white/40 font-bold text-sm">Loading worker profile...</p>
      </div>
    );
  }

  const worker = data?.worker;
  const wallet = data?.wallet;
  const stats = data?.stats;
  const profile = worker?.profile;
  const bookings = data?.bookings || [];
  const disputes = data?.disputes || [];
  const transactions = data?.transactions || [];
  const fraudFlags = data?.fraud_flags || [];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/admin/workers"
          className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-all mt-0.5 shrink-0"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/30 mb-1">Worker Profile</p>
          <h1 className="text-xl font-black text-white truncate">{profile?.full_name || 'Unknown Worker'}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn('px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase', STATUS_COLORS[worker?.status] || 'bg-white/10 text-white/40 border-white/10')}>
              {worker?.status?.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] text-white/30 font-semibold capitalize">{worker?.category?.replace(/_/g, ' ')}</span>
            {worker?.verified && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
                <CheckCircle2 size={10} /> Verified
              </span>
            )}
            {fraudFlags.filter((f: any) => f.status === 'open').length > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-red-400 font-bold">
                <AlertTriangle size={10} /> {fraudFlags.filter((f: any) => f.status === 'open').length} Fraud Flag(s)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Bookings', value: stats?.total_bookings ?? 0, color: 'text-white' },
          { label: 'Completed', value: stats?.completed ?? 0, color: 'text-emerald-400' },
          { label: 'Cancelled', value: stats?.cancelled ?? 0, color: 'text-red-400' },
          { label: 'Disputed', value: stats?.disputed ?? 0, color: 'text-amber-400' },
          { label: 'Completion Rate', value: `${stats?.completion_rate ?? 0}%`, color: stats?.completion_rate >= 80 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Total Earned', value: `₹${(stats?.total_earned ?? 0).toLocaleString('en-IN')}`, color: 'text-violet-400' },
        ].map((s) => (
          <div key={s.label} className="bg-white/3 border border-white/8 rounded-xl p-3 text-center">
            <p className={cn('text-xl font-black', s.color)}>{s.value}</p>
            <p className="text-[10px] text-white/30 font-bold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/8 overflow-x-auto">
        {(['overview', 'bookings', 'wallet', 'disputes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap -mb-px',
              activeTab === tab
                ? 'border-violet-400 text-violet-400'
                : 'border-transparent text-white/30 hover:text-white/60'
            )}
          >
            {tab}
            {tab === 'disputes' && disputes.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[9px] font-black">{disputes.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Profile Info */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-white/40">Contact & Profile</h3>
            <div className="space-y-3">
              {[
                { icon: Phone, label: profile?.phone || 'N/A' },
                { icon: Mail, label: profile?.email || 'N/A' },
                { icon: Star, label: `${worker?.rating_avg ?? 0}/5 · ${worker?.review_count ?? 0} reviews` },
                { icon: Calendar, label: `Joined ${profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-IN') : 'N/A'}` },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <Icon size={14} className="text-white/30 shrink-0" />
                  <span className="text-white/70 font-semibold truncate">{label}</span>
                </div>
              ))}
            </div>

            {/* Wallet balance */}
            <div className="border-t border-white/8 pt-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-white/30 mb-2">Wallet Balance</p>
              <p className={cn('text-2xl font-black', Number(wallet?.balance || 0) < 500 ? 'text-red-400' : 'text-emerald-400')}>
                ₹{Number(wallet?.balance || 0).toLocaleString('en-IN')}
              </p>
              {Number(wallet?.balance || 0) < 500 && (
                <p className="text-[10px] text-red-400 font-bold mt-1">⚠ Below minimum balance (₹500)</p>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-white/40">KYC Documents</h3>
            {worker?.documents && worker.documents.length > 0 ? (
              <div className="space-y-2">
                {worker.documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-white/3 border border-white/8 rounded-xl">
                    <div>
                      <p className="text-xs font-black text-white capitalize">{doc.document_type?.replace(/_/g, ' ')}</p>
                      {doc.verified ? (
                        <p className="text-[10px] text-emerald-400 font-bold mt-0.5 flex items-center gap-1"><CheckCircle2 size={9} /> Verified</p>
                      ) : (
                        <p className="text-[10px] text-amber-400 font-bold mt-0.5">Pending review</p>
                      )}
                    </div>
                    <a href={doc.document_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/20 text-violet-400 text-[10px] font-black hover:bg-violet-500/25 transition-all">
                      <Eye size={11} /> View
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-white/20 text-xs font-bold">No documents uploaded</div>
            )}
          </div>

          {/* Moderation Actions */}
          <div className="lg:col-span-2 bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-white/40">Moderation Actions</h3>
            <textarea
              value={moderationNote}
              onChange={(e) => setModerationNote(e.target.value)}
              placeholder="Moderation note (reason for action — logged and visible in audit trail)..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 font-medium focus:outline-none focus:border-violet-500/50 min-h-[80px] resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {worker?.status !== 'approved' && (
                <button onClick={() => moderate('approve')} disabled={moderating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 text-xs font-black hover:bg-emerald-500/25 transition-all disabled:opacity-50">
                  <UserCheck size={13} /> Approve & Activate
                </button>
              )}
              {worker?.status === 'approved' && (
                <button onClick={() => moderate('suspend')} disabled={moderating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-black hover:bg-amber-500/25 transition-all disabled:opacity-50">
                  <Ban size={13} /> Suspend
                </button>
              )}
              {worker?.status === 'suspended' && (
                <button onClick={() => moderate('reactivate')} disabled={moderating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 text-xs font-black hover:bg-blue-500/25 transition-all disabled:opacity-50">
                  <UserCheck size={13} /> Reactivate
                </button>
              )}
              {worker?.status !== 'rejected' && worker?.status !== 'approved' && (
                <button onClick={() => moderate('reject')} disabled={moderating}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 text-xs font-black hover:bg-red-500/25 transition-all disabled:opacity-50">
                  <UserX size={13} /> Reject
                </button>
              )}
              {moderating && <Loader2 size={16} className="animate-spin text-white/40 ml-2 mt-2" />}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/8">
            <p className="text-xs font-black uppercase tracking-wider text-white/40">Booking History ({bookings.length})</p>
          </div>
          {bookings.length === 0 ? (
            <div className="text-center py-10 text-white/20 text-xs font-bold">No bookings found</div>
          ) : (
            <div className="divide-y divide-white/5">
              {bookings.map((b: any) => (
                <div key={b.id} className="px-5 py-3.5 hover:bg-white/3 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-white/80 capitalize">{b.category?.replace(/_/g, ' ')}</p>
                      <p className="text-[10px] text-white/30 font-mono mt-0.5">#{b.id?.slice(0, 14)}</p>
                      <p className="text-[10px] text-white/25 mt-0.5">
                        Client: {b.client?.profile?.full_name || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('text-xs font-black capitalize', BOOKING_STATUS_COLOR[b.status] || 'text-white/40')}>
                        {b.status?.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm font-black text-white mt-0.5">₹{Number(b.total_price || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-white/25 mt-0.5">
                        {new Date(b.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'wallet' && (
        <div className="space-y-4">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-white/30">Current Balance</p>
                <p className={cn('text-3xl font-black mt-1', Number(wallet?.balance || 0) < 500 ? 'text-red-400' : 'text-emerald-400')}>
                  ₹{Number(wallet?.balance || 0).toLocaleString('en-IN')}
                </p>
              </div>
              <Wallet size={28} className="text-violet-400/40" />
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/8">
              {[
                { label: 'Commission Paid', value: stats?.total_commission ?? 0, color: 'text-red-400', icon: TrendingDown },
                { label: 'Total Earned', value: stats?.total_earned ?? 0, color: 'text-emerald-400', icon: TrendingUp },
                { label: 'Net', value: (stats?.total_earned ?? 0) - (stats?.total_commission ?? 0), color: 'text-white', icon: IndianRupee },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="text-center">
                  <Icon size={14} className={cn('mx-auto mb-1', color)} />
                  <p className={cn('text-base font-black', color)}>₹{Number(value).toLocaleString('en-IN')}</p>
                  <p className="text-[9px] text-white/25 font-bold">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/8">
              <p className="text-xs font-black uppercase tracking-wider text-white/40">Transaction Ledger ({transactions.length})</p>
            </div>
            <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
              {transactions.map((tx: any) => (
                <div key={tx.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white/70 truncate">{tx.description}</p>
                    <p className="text-[10px] text-white/25 font-semibold mt-0.5">
                      {new Date(tx.created_at).toLocaleString('en-IN')} · Bal: ₹{Number(tx.balance_after).toFixed(0)}
                    </p>
                  </div>
                  <span className={cn('text-sm font-black shrink-0', tx.type === 'commission' || tx.type === 'debit' ? 'text-red-400' : 'text-emerald-400')}>
                    {(tx.type === 'commission' || tx.type === 'debit') ? '-' : '+'}₹{Number(tx.amount).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'disputes' && (
        <div className="space-y-3">
          {disputes.length === 0 ? (
            <div className="text-center py-10 text-white/20 text-xs font-bold">No disputes found</div>
          ) : (
            disputes.map((d: any) => (
              <div key={d.id} className="bg-white/3 border border-white/8 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{d.title}</p>
                    <p className="text-[10px] text-white/30 font-semibold mt-0.5 capitalize">
                      {d.dispute_type?.replace(/_/g, ' ')} · {d.priority}
                    </p>
                  </div>
                  <span className={cn('px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase',
                    d.status === 'open' ? 'bg-red-500/15 text-red-400 border-red-500/20' :
                    d.status === 'resolved_worker' || d.status === 'closed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                    'bg-amber-500/15 text-amber-400 border-amber-500/20'
                  )}>
                    {d.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <Link href="/admin/disputes" className="flex items-center gap-1 text-[10px] text-violet-400 font-bold mt-2 hover:text-violet-300 transition-colors">
                  View in dispute center →
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
