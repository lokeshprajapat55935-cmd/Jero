'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ScrollText, Loader2, RefreshCw, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTION_TYPE_COLORS: Record<string, string> = {
  worker_approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  worker_suspended: 'bg-red-500/15 text-red-400 border-red-500/20',
  worker_rejected: 'bg-red-600/15 text-red-500 border-red-600/20',
  dispute_created: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  dispute_resolve_client: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  dispute_resolve_worker: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  dispute_escalate: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  settings_updated: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  notification_broadcast: 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  fraud_flag_created: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  fraud_flag_dismissed: 'bg-white/5 text-white/30 border-white/10',
  client_suspended: 'bg-red-500/15 text-red-400 border-red-500/20',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (actionFilter !== 'all') params.set('action_type', actionFilter);
      const res = await fetch(`/api/admin/audit?${params}`);
      const json = await res.json();
      setLogs(json.data?.logs || []);
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = search.trim()
    ? logs.filter((l) =>
        l.action_type?.includes(search.toLowerCase()) ||
        l.target_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.admin?.full_name?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const actionTypes = [...new Set(logs.map((l) => l.action_type))].sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Compliance</p>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ScrollText size={20} className="text-violet-400" /> Audit Log
          </h1>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by action, target or admin..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/20 font-medium focus:outline-none focus:border-violet-500/50"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70 font-bold focus:outline-none focus:border-violet-500/50 min-w-[180px]"
        >
          <option value="all" className="bg-[#0f0f13]">All Actions</option>
          {actionTypes.map((at) => (
            <option key={at} value={at} className="bg-[#0f0f13]">{at.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Log table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 size={24} className="animate-spin text-violet-400" />
          <p className="text-white/40 text-sm font-bold">Loading audit trail...</p>
        </div>
      ) : (
        <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/8">
            <p className="text-xs font-black uppercase tracking-wider text-white/40">{filtered.length} entries</p>
          </div>
          <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-white/20 text-xs font-bold">No audit entries found</div>
            ) : (
              filtered.map((log) => {
                const isExpanded = expanded === log.id;
                const color = ACTION_TYPE_COLORS[log.action_type] || 'bg-white/5 text-white/30 border-white/10';
                return (
                  <div key={log.id}>
                    <button
                      className="w-full px-5 py-3.5 flex items-center gap-4 hover:bg-white/3 transition-colors text-left"
                      onClick={() => setExpanded(isExpanded ? null : log.id)}
                    >
                      <span className={cn('px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase whitespace-nowrap shrink-0', color)}>
                        {log.action_type?.replace(/_/g, ' ')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white/80 truncate">
                          {log.target_name || log.target_id?.slice(0, 14)}
                        </p>
                        <p className="text-[10px] text-white/25 font-semibold mt-0.5">
                          by {log.admin?.full_name || 'Unknown'} · {new Date(log.created_at).toLocaleString('en-IN')}
                        </p>
                      </div>
                      {isExpanded ? (
                        <ChevronUp size={13} className="text-white/20 shrink-0" />
                      ) : (
                        <ChevronDown size={13} className="text-white/20 shrink-0" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="px-5 pb-4 space-y-3 border-t border-white/5">
                        {log.reason && (
                          <div className="mt-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-white/20 mb-1">Reason / Note</p>
                            <p className="text-xs text-white/50 font-medium">{log.reason}</p>
                          </div>
                        )}
                        {(log.old_value || log.new_value) && (
                          <div className="grid sm:grid-cols-2 gap-3">
                            {log.old_value && (
                              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                                <p className="text-[9px] font-black uppercase text-red-400/60 mb-1">Before</p>
                                <pre className="text-[10px] text-white/40 font-mono overflow-auto">
                                  {JSON.stringify(log.old_value, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.new_value && (
                              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3">
                                <p className="text-[9px] font-black uppercase text-emerald-400/60 mb-1">After</p>
                                <pre className="text-[10px] text-white/40 font-mono overflow-auto">
                                  {JSON.stringify(log.new_value, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex gap-4 text-[9px] text-white/20 font-semibold">
                          <span>Target: {log.target_type} · {log.target_id?.slice(0, 14)}</span>
                          {log.ip_address && <span>IP: {log.ip_address}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
