'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Users, Search, Loader2, RefreshCw, AlertTriangle, XCircle, CheckCircle2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ClientData {
  id: string;
  profile: { id: string; full_name: string; email: string; phone: string; created_at: string };
  stats: {
    total_bookings: number;
    completed_bookings: number;
    cancelled_bookings: number;
    disputed_bookings: number;
    total_spend: number;
    cancellation_rate: number;
  };
}

export default function ClientsPage() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [filtered, setFiltered] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/clients?limit=100');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setClients(json.data?.clients || []);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search.trim()) { setFiltered(clients); return; }
    const q = search.toLowerCase();
    setFiltered(clients.filter((c) =>
      c.profile?.full_name?.toLowerCase().includes(q) ||
      c.profile?.email?.toLowerCase().includes(q) ||
      c.profile?.phone?.includes(q)
    ));
  }, [clients, search]);

  const handleAction = async (clientId: string, action: 'block' | 'unblock', name: string) => {
    const reason = window.prompt(`Reason for ${action}ing ${name}:`);
    if (!reason || reason.trim().length < 5) { toast({ title: 'Reason required (min 5 chars)' }); return; }
    setActionLoading(clientId);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, action, reason }),
      });
      if (!res.ok) throw new Error('Action failed');
      toast({ title: 'Action applied', description: `Client ${action}d.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Management</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Users size={20} className="text-violet-400" /> Client Registry
          </h1>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email or phone..."
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/20 font-medium focus:outline-none focus:border-violet-500/50"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 size={24} className="animate-spin text-violet-400" />
          <p className="text-white/40 text-sm font-bold">Loading client registry...</p>
        </div>
      ) : (
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-white/40">
              {filtered.length} Clients
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/8">
                  {['Client', 'Contact', 'Bookings', 'Spend', 'Cancel Rate', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white/30">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-black text-white text-xs">{c.profile?.full_name || 'N/A'}</p>
                      <p className="text-[10px] text-white/30 font-semibold mt-0.5">
                        {new Date(c.profile?.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-semibold text-white/70">{c.profile?.phone || 'N/A'}</p>
                      <p className="text-[10px] text-white/30">{c.profile?.email || 'N/A'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-black text-white">{c.stats.total_bookings}</p>
                      <p className="text-[10px] text-white/30">
                        {c.stats.completed_bookings} done · {c.stats.disputed_bookings} disp
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-black text-emerald-400">
                        ₹{c.stats.total_spend.toLocaleString('en-IN')}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-black border',
                        c.stats.cancellation_rate > 30
                          ? 'bg-red-500/15 text-red-400 border-red-500/20'
                          : c.stats.cancellation_rate > 15
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                      )}>
                        {c.stats.cancellation_rate}%
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(c.id, 'block', c.profile?.full_name)}
                          disabled={actionLoading === c.id}
                          className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black hover:bg-red-500/20 transition-all disabled:opacity-50"
                        >
                          Block
                        </button>
                        <button
                          onClick={() => handleAction(c.id, 'unblock', c.profile?.full_name)}
                          disabled={actionLoading === c.id}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                        >
                          Unblock
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-10 text-white/20 text-xs font-bold">No clients found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
