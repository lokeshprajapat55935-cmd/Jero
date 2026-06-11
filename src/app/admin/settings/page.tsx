'use client';

import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Settings, Loader2, RefreshCw, Save, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const AdminCityManager = dynamic(
  () => import('@/components/admin/CityManager').then((mod) => mod.AdminCityManager),
  {
    loading: () => (
      <div className="flex items-center justify-center py-20 gap-3 bg-white/3 border border-white/8 rounded-2xl">
        <Loader2 className="animate-spin text-violet-400" size={24} />
        <p className="text-white/40 font-bold text-sm">Loading city manager...</p>
      </div>
    ),
    ssr: false,
  }
);

interface Config { key: string; value: string; description: string | null; }

// Numeric settings that get a slider/number input
const NUMERIC_KEYS = new Set([
  'commission_rate', 'online_payment_discount', 'min_wallet_balance',
  'max_booking_radius_km', 'booking_auto_cancel_minutes',
  'fraud_otp_threshold', 'fraud_cancellation_threshold',
]);

const PERCENT_KEYS = new Set(['commission_rate', 'online_payment_discount']);

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<'platform' | 'cities'>('platform');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const json = await res.json();
      const cfgs: Config[] = json.data?.settings || [];
      setSettings(cfgs);
      const initial: Record<string, string> = {};
      cfgs.forEach((c) => { initial[c.key] = c.value; });
      setEdits(initial);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (key: string) => {
    setSaving(key);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: edits[key], reason: `Updated via admin settings panel` }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: 'Setting saved', description: `${key} updated to ${edits[key]}` });
      load();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Failed', description: e.message });
    } finally {
      setSaving(null);
    }
  };

  const isDirty = (key: string) => {
    const original = settings.find((s) => s.key === key)?.value;
    return edits[key] !== original;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-white/40 mb-1">Configuration</p>
        <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Settings size={20} className="text-violet-400" /> Platform Settings
        </h1>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 border-b border-white/8">
        {[{ id: 'platform', label: 'Platform Config' }, { id: 'cities', label: 'City Management' }].map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id as any)}
            className={cn(
              'px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all -mb-px',
              activeSection === s.id
                ? 'border-violet-400 text-violet-400'
                : 'border-transparent text-white/30 hover:text-white/60'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'platform' && (
        <>
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/15">
            <AlertTriangle size={14} className="text-amber-400 shrink-0" />
            <p className="text-[10px] text-amber-400/80 font-semibold">
              Changes to commission rates and payment settings take effect immediately for all new bookings.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <Loader2 size={24} className="animate-spin text-violet-400" />
              <p className="text-white/40 text-sm font-bold">Loading settings...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {settings.map((s) => {
                const isNumeric = NUMERIC_KEYS.has(s.key);
                const isPercent = PERCENT_KEYS.has(s.key);
                const dirty = isDirty(s.key);
                const currentEdit = edits[s.key] ?? s.value;

                return (
                  <div key={s.key} className={cn(
                    'bg-white/3 border rounded-2xl p-5 transition-all',
                    dirty ? 'border-violet-500/30 bg-violet-500/5' : 'border-white/8'
                  )}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-white font-mono">{s.key}</p>
                        {s.description && (
                          <p className="text-[10px] text-white/30 font-semibold mt-0.5">{s.description}</p>
                        )}
                      </div>
                      {dirty && (
                        <button
                          onClick={() => save(s.key)}
                          disabled={saving === s.key}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/80 hover:bg-violet-500 text-white text-[10px] font-black transition-all disabled:opacity-50"
                        >
                          {saving === s.key ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                          Save
                        </button>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      {isNumeric ? (
                        <>
                          <input
                            type="range"
                            min={isPercent ? 0 : 0}
                            max={isPercent ? 1 : s.key.includes('radius') ? 50 : s.key.includes('minutes') ? 60 : 20}
                            step={isPercent ? 0.01 : 1}
                            value={parseFloat(currentEdit) || 0}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                            className="flex-1 h-2 rounded-full appearance-none bg-white/10 accent-violet-500"
                          />
                          <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 min-w-[80px] text-center">
                            <span className="text-sm font-black text-white">
                              {isPercent ? `${(parseFloat(currentEdit) * 100).toFixed(0)}%` : currentEdit}
                            </span>
                          </div>
                        </>
                      ) : (
                        <input
                          value={currentEdit}
                          onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-medium focus:outline-none focus:border-violet-500/50"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeSection === 'cities' && (
        <AdminCityManager />
      )}
    </div>
  );
}
