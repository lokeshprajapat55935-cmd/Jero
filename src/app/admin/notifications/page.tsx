'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Bell, Loader2, RefreshCw, Send, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const TARGET_OPTIONS = [
  { value: 'all_workers', label: 'All Workers' },
  { value: 'all_clients', label: 'All Clients' },
  { value: 'all_users', label: 'All Users' },
  { value: 'specific_user', label: 'Specific User (by ID)' },
];

const TYPE_OPTIONS = [
  { value: 'info', label: 'Info', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  { value: 'announcement', label: 'Announcement', classes: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
  { value: 'warning', label: 'Warning', classes: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  { value: 'urgent', label: 'Urgent', classes: 'bg-red-500/15 text-red-400 border-red-500/20' },
];

export default function NotificationsPage() {
  const { toast } = useToast();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [form, setForm] = useState({
    target_type: 'all_workers',
    target_user_id: '',
    title: '',
    message: '',
    notification_type: 'info' as const,
  });

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications');
      const json = await res.json();
      setHistory(json.data?.notifications || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSend = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast({ title: 'Title and message required' }); return;
    }
    if (form.target_type === 'specific_user' && !form.target_user_id.trim()) {
      toast({ title: 'User ID required for specific user target' }); return;
    }
    setSending(true);
    try {
      const payload: any = {
        target_type: form.target_type,
        title: form.title,
        message: form.message,
        notification_type: form.notification_type,
      };
      if (form.target_type === 'specific_user') payload.target_user_id = form.target_user_id;

      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      toast({ title: 'Broadcast sent!', description: `Delivered to ${json.data?.sent_count ?? 0} users.` });
      setForm({ target_type: 'all_workers', target_user_id: '', title: '', message: '', notification_type: 'info' });
      loadHistory();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Communications</p>
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Bell size={20} className="text-violet-400" /> Notification Center
        </h1>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Compose Form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white/3 border border-white/8 rounded-2xl p-5 space-y-4">
            <p className="text-xs font-black uppercase tracking-wider text-white/40">Compose Broadcast</p>

            {/* Target */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-white/30">Target Audience</label>
              <select
                value={form.target_type}
                onChange={(e) => setForm((f) => ({ ...f, target_type: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-violet-500/50"
              >
                {TARGET_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#0f0f13]">{o.label}</option>
                ))}
              </select>
            </div>

            {form.target_type === 'specific_user' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-white/30">User ID (UUID)</label>
                <input
                  value={form.target_user_id}
                  onChange={(e) => setForm((f) => ({ ...f, target_user_id: e.target.value }))}
                  placeholder="Paste user UUID..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-violet-500/50"
                />
              </div>
            )}

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-white/30">Notification Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setForm((f) => ({ ...f, notification_type: t.value as any }))}
                    className={cn(
                      'py-2 rounded-xl border text-[10px] font-black uppercase transition-all',
                      form.notification_type === t.value ? t.classes : 'bg-white/3 border-white/8 text-white/30 hover:text-white/60'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-white/30">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Notification title..."
                maxLength={100}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white font-bold placeholder-white/20 focus:outline-none focus:border-violet-500/50"
              />
            </div>

            {/* Message */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-white/30">Message</label>
              <textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                placeholder="Broadcast message to users..."
                maxLength={500}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-white font-medium placeholder-white/20 focus:outline-none focus:border-violet-500/50 min-h-[100px] resize-none"
              />
              <p className="text-[9px] text-white/20 text-right">{form.message.length}/500</p>
            </div>

            <button
              onClick={handleSend}
              disabled={sending || !form.title.trim() || !form.message.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-500/80 hover:bg-violet-500 text-white text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending ? 'Sending...' : 'Send Broadcast'}
            </button>
          </div>
        </div>

        {/* History */}
        <div className="lg:col-span-3">
          <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
              <p className="text-xs font-black uppercase tracking-wider text-white/40">Broadcast History</p>
              <button onClick={loadHistory} disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-white/40 text-[10px] font-bold hover:text-white transition-all">
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <Loader2 size={20} className="animate-spin text-violet-400" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12">
                <Bell size={28} className="mx-auto text-white/10 mb-3" />
                <p className="text-white/20 text-xs font-bold">No broadcasts sent yet</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {history.map((n) => {
                  const typeCfg = TYPE_OPTIONS.find((t) => t.value === n.notification_type) || TYPE_OPTIONS[0];
                  return (
                    <div key={n.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={cn('px-2 py-0.5 rounded-md border text-[9px] font-black uppercase', typeCfg.classes)}>
                              {typeCfg.label}
                            </span>
                            <span className="text-[9px] text-white/30 font-bold capitalize">
                              {n.target_type?.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs font-black text-white">{n.title}</p>
                          <p className="text-[10px] text-white/50 font-medium mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[9px] text-white/25 font-semibold mt-1.5">
                            Sent by {n.sender?.full_name || 'Admin'} · {new Date(n.created_at).toLocaleString('en-IN')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-white">{n.sent_count}</p>
                          <p className="text-[9px] text-white/25 font-bold">delivered</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
