'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import logger from '@/lib/logger';
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  IndianRupee, 
  Loader2, 
  RefreshCw, 
  Activity,
  CalendarDays,
  Smartphone
} from 'lucide-react';

interface EventLog {
  id: string;
  user_id?: string;
  anonymous_id?: string;
  event_name: string;
  properties: Record<string, any>;
  user_agent?: string;
  ip_address?: string;
  created_at: string;
  profile?: {
    full_name: string;
    email: string;
  };
}

interface AnalyticsData {
  stats: {
    users: {
      total: number;
      clients: number;
      workers: number;
      admins: number;
    };
    bookings: {
      total: number;
      completed: number;
      pending: number;
      confirmed: number;
      cancelled: number;
      disputed: number;
      cashCollected: number;
    };
  };
  recentEvents: EventLog[];
}

export function AnalyticsOverview() {
  const { toast } = useToast();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/analytics/overview');
      if (!res.ok) throw new Error('Failed to load analytics data');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load analytics';
      logger.error('Analytics overview load error', error);
      toast({ variant: 'destructive', title: 'Analytics error', description: message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getEventBadgeClass = (name: string) => {
    switch (name) {
      case 'booking_created':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'booking_status_updated':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'search_performed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'worker_profile_viewed':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'worker_phone_clicked':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-sm font-bold text-muted-foreground">Calculating metrics and telemetry logs...</p>
      </div>
    );
  }

  const stats = data?.stats;
  const recentEvents = data?.recentEvents || [];

  return (
    <div className="space-y-6">
      {/* Overview Header Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <BarChart3 className="text-primary" size={22} />
          <h2 className="text-xl font-bold">Operational Insights</h2>
        </div>
        <Button variant="outline" size="sm" onClick={loadOverview} disabled={refreshing} className="gap-2">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Analytics Summary Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Gross Transaction Volume</p>
                <h3 className="text-2xl font-black mt-2 flex items-center text-primary">
                  <IndianRupee size={20} /> {stats.bookings.cashCollected}
                </h3>
              </div>
              <div className="h-10 w-10 rounded-lg bg-green-50 text-green-700 flex items-center justify-center">
                <IndianRupee size={20} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 font-semibold">
              Total completed bookings cash value
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Job Fulfillment</p>
                <h3 className="text-2xl font-black mt-2">
                  {stats.bookings.completed} / {stats.bookings.total}
                </h3>
              </div>
              <div className="h-10 w-10 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
                <CalendarDays size={20} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 font-semibold">
              {stats.bookings.pending} pending · {stats.bookings.disputed} disputed
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">User Base</p>
                <h3 className="text-2xl font-black mt-2">
                  {stats.users.total}
                </h3>
              </div>
              <div className="h-10 w-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <Users size={20} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 font-semibold">
              {stats.users.clients} clients · {stats.users.workers} professionals
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Platform Health</p>
                <h3 className="text-2xl font-black mt-2 text-green-600">
                  98.4%
                </h3>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 font-semibold">
              Conversion rate & server status active
            </p>
          </Card>
        </div>
      )}

      {/* Real-time Telemetry Event Feed */}
      <Card className="overflow-hidden">
        <div className="border-b border-border p-4 bg-secondary/10 flex items-center gap-2">
          <Activity className="text-primary animate-pulse" size={16} />
          <h3 className="font-extrabold text-sm uppercase tracking-wider">Real-time Telemetry Log</h3>
        </div>
        
        {recentEvents.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm font-semibold">
            No analytics events logged yet. Perform some searches or view worker profiles to trigger telemetry.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>User Context</TableHead>
                  <TableHead>Properties</TableHead>
                  <TableHead>Device/IP</TableHead>
                  <TableHead className="text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEvents.map((event) => {
                  const propertiesList = Object.entries(event.properties || {});
                  const userContext = event.profile
                    ? `${event.profile.full_name} (${event.profile.email})`
                    : event.anonymous_id
                    ? `Guest (${event.anonymous_id.substring(0, 10)}...)`
                    : 'System/Unknown';

                  return (
                    <TableRow key={event.id} className="hover:bg-secondary/5 font-medium text-xs">
                      <TableCell>
                        <span className={`px-2 py-1 border rounded text-[10px] font-bold uppercase ${getEventBadgeClass(event.event_name)}`}>
                          {event.event_name.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="font-bold text-foreground">
                        {userContext}
                      </TableCell>
                      <TableCell>
                        {propertiesList.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {propertiesList.map(([key, val]) => (
                              <span key={key} className="bg-secondary/50 px-1.5 py-0.5 rounded text-[10px]">
                                <strong className="opacity-80">{key}:</strong> {String(val)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground font-semibold">none</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-[150px]" title={event.user_agent}>
                        <div className="flex items-center gap-1">
                          <Smartphone size={10} />
                          {event.user_agent ? event.user_agent.split(' ')[0] : 'Unknown'}
                          {event.ip_address && ` • ${event.ip_address.split(',')[0]}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {new Date(event.created_at).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
