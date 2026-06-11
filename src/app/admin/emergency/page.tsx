"use client";

import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AuthGate } from "@/components/auth/AuthGate";
import logger from "@/lib/logger";

interface EmergencyData {
  requests: unknown[];
  metrics: { active: number; accepted: number; expired: number; total: number };
}

export default function AdminEmergencyPage() {
  const [data, setData] = useState<EmergencyData>({ requests: [], metrics: { active: 0, accepted: 0, expired: 0, total: 0 } });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/admin/emergency");
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const result = await response.json().catch(() => ({}));
        if (result.success) setData(result.data);
      } catch (error) {
        logger.error('Failed to load emergency data', error);
      } finally {
        setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, 5000);
    return () => window.clearInterval(interval);
  }, []);

  const metrics = [
    { label: "Active dispatch", value: data.metrics.active, icon: AlertTriangle, tone: "text-red-600 bg-red-50" },
    { label: "Accepted", value: data.metrics.accepted, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50" },
    { label: "Expired", value: data.metrics.expired, icon: Clock3, tone: "text-amber-600 bg-amber-50" },
    { label: "Total tracked", value: data.metrics.total, icon: Activity, tone: "text-slate-700 bg-slate-100" },
  ];

  return (
    <AuthGate allowedRoles={["admin"]}>
      <div className="app-shell py-8">
        <div className="mb-6">
          <p className="section-label">Emergency control</p>
          <h1 className="mt-1 text-3xl font-extrabold">Live dispatch monitor</h1>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.label} className="p-4">
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${metric.tone}`}>
                <metric.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-black">{metric.value}</p>
              <p className="text-xs font-bold text-muted-foreground">{metric.label}</p>
            </Card>
          ))}
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="border-b border-border p-4">
            <h2 className="text-lg font-extrabold">Recent emergency requests</h2>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-5 text-sm font-bold text-muted-foreground">Loading dispatches...</div>
            ) : data.requests.length > 0 ? data.requests.map((request: any) => (
              <div key={request.id} className="grid gap-2 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black">{request.category}</p>
                    <Badge variant="secondary" className="capitalize">{request.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-muted-foreground">
                    {request.location_address || "No address"} · alerted {request.notified_worker_count || 0} workers
                  </p>
                </div>
                <p className="text-xs font-bold text-muted-foreground">{new Date(request.created_at).toLocaleString()}</p>
              </div>
            )) : (
              <div className="p-5 text-sm font-bold text-muted-foreground">No emergency requests yet.</div>
            )}
          </div>
        </Card>
      </div>
    </AuthGate>
  );
}
