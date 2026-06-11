'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Wallet,
  Wrench,
  Users,
  Shield,
  Loader2,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Info,
  ThumbsUp,
  MapPin,
  Filter,
} from 'lucide-react';
import { useUser } from '@/providers/UserProvider';

interface AnalyticsData {
  bookings: {
    total_bookings: number;
    completed_bookings: number;
    cancelled_bookings: number;
    avg_response_time_seconds: number;
    avg_completion_time_seconds: number;
    completion_rate: number;
    cancellation_rate: number;
    daily_trends: { date: string; total: number; completed: number; cancelled: number }[];
  };
  revenue: {
    total_revenue: number;
    platform_revenue: number;
    worker_earnings: number;
    category_distribution: { category: string; revenue: number }[];
    daily_trends: { date: string; revenue: number; platform: number; worker: number }[];
  };
  workers: {
    total_workers: number;
    avg_rating: number;
    avg_acceptance_rate: number;
    top_performing: {
      worker_id: string;
      name: string;
      category: string;
      avg_rating: number;
      jobs_completed: number;
      acceptance_rate: number;
    }[];
  };
  customers: {
    total_customers: number;
    active_customers: number;
    repeat_customers: number;
    booking_frequency: number;
  };
  fraud: {
    id: string;
    user_id: string;
    user_name: string;
    flag_type: string;
    severity: string;
    status: string;
    description: string;
    booking_id?: string;
    evidence: any;
    created_at: string;
  }[];
}

export function AnalyticsDetailed() {
  const { profile } = useUser();
  const adminRole = profile?.admin_role ?? 'super_admin';

  const [activeTab, setActiveTab] = useState<'bookings' | 'revenue' | 'workers' | 'customers' | 'fraud'>('bookings');
  const [cityFilter, setCityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chart Tooltips States
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (cityFilter !== 'all') params.append('city', cityFilter);
        if (categoryFilter !== 'all') params.append('category', categoryFilter);

        const res = await fetch(`/api/admin/analytics/detailed?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'Failed to fetch analytics');
        }

        const json = await res.json();
        setData(json.data);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'An error occurred while loading data.');
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [cityFilter, categoryFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 bg-[#0f0f13] border border-white/5 rounded-3xl">
        <Loader2 className="animate-spin text-violet-500" size={32} />
        <p className="text-white/50 text-sm font-semibold tracking-wide">Synthesizing intelligence metrics...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 bg-red-500/5 border border-red-500/10 rounded-3xl text-center px-6">
        <AlertTriangle className="text-red-400" size={40} />
        <div>
          <h3 className="text-white font-bold text-lg">Failed to Load Metrics</h3>
          <p className="text-white/40 text-sm mt-1 max-w-md">{error || 'Unknown error occurred.'}</p>
        </div>
      </div>
    );
  }

  // --- SVG Chart Helpers ---

  // Custom SVG Line Chart
  const renderLineChart = (
    trends: { date: string; [key: string]: any }[],
    keys: string[],
    labels: string[],
    colors: string[]
  ) => {
    if (!trends || trends.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-white/20 text-sm">
          No trend data matches the current filters.
        </div>
      );
    }

    const padding = { top: 20, right: 30, bottom: 30, left: 40 };
    const width = 600;
    const height = 240;

    // Find Max Value
    let maxVal = 10;
    trends.forEach((t) => {
      keys.forEach((key) => {
        if (Number(t[key]) > maxVal) maxVal = Number(t[key]);
      });
    });
    maxVal = Math.ceil(maxVal * 1.15); // Add margin

    const getX = (index: number) => {
      const step = (width - padding.left - padding.right) / Math.max(trends.length - 1, 1);
      return padding.left + index * step;
    };

    const getY = (value: number) => {
      const scale = (height - padding.top - padding.bottom) / maxVal;
      return height - padding.bottom - value * scale;
    };

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 overflow-visible">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const val = Math.round(maxVal * p);
            const y = getY(val);
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="4 4"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  fill="rgba(255,255,255,0.3)"
                  fontSize="9"
                  textAnchor="end"
                  className="font-mono font-bold"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Dates X axis */}
          {trends.map((t, idx) => {
            if (trends.length > 10 && idx % Math.ceil(trends.length / 5) !== 0) return null;
            const x = getX(idx);
            const date = new Date(t.date);
            const labelStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            return (
              <text
                key={idx}
                x={x}
                y={height - 10}
                fill="rgba(255,255,255,0.3)"
                fontSize="9"
                textAnchor="middle"
                className="font-semibold"
              >
                {labelStr}
              </text>
            );
          })}

          {/* Lines paths */}
          {keys.map((key, kIdx) => {
            let pathD = '';
            trends.forEach((t, tIdx) => {
              const x = getX(tIdx);
              const y = getY(t[key]);
              pathD += `${tIdx === 0 ? 'M' : 'L'} ${x} ${y}`;
            });

            return (
              <g key={key}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={colors[kIdx]}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-300"
                />
                {/* Dots on line */}
                {trends.map((t, tIdx) => {
                  const x = getX(tIdx);
                  const y = getY(t[key]);
                  const isHovered = hoveredIndex === tIdx;
                  return (
                    <circle
                      key={tIdx}
                      cx={x}
                      cy={y}
                      r={isHovered ? 5 : 3}
                      fill={colors[kIdx]}
                      stroke="#0f0f13"
                      strokeWidth={isHovered ? 2 : 1}
                      className="cursor-pointer transition-all"
                      onMouseEnter={(e) => {
                        setHoveredIndex(tIdx);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltipPos({
                          x: x,
                          y: y - 10,
                        });
                      }}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredIndex !== null && trends[hoveredIndex] && (
          <div
            className="absolute bg-[#1a1a24] border border-white/10 px-3 py-2 rounded-xl text-[11px] text-white pointer-events-none shadow-2xl backdrop-blur-md flex flex-col gap-1 -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(tooltipPos.x / width) * 100}%`,
              top: `${(tooltipPos.y / height) * 100}%`,
            }}
          >
            <p className="font-bold text-white/40 mb-0.5">
              {new Date(trends[hoveredIndex].date).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            {keys.map((key, idx) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[idx] }} />
                <span className="font-semibold text-white/70">{labels[idx]}:</span>
                <span className="font-mono font-bold text-white ml-auto">
                  {key.includes('revenue') || key.includes('earn') ? '₹' : ''}
                  {trends[hoveredIndex][key]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Custom SVG Bar Chart
  const renderBarChart = (
    trends: { date: string; [key: string]: any }[],
    keys: string[],
    labels: string[],
    colors: string[]
  ) => {
    if (!trends || trends.length === 0) {
      return <div className="h-64 flex items-center justify-center text-white/20 text-sm">No trend data matching filters.</div>;
    }

    const padding = { top: 20, right: 30, bottom: 30, left: 45 };
    const width = 600;
    const height = 240;

    let maxVal = 100;
    trends.forEach((t) => {
      let sum = 0;
      keys.forEach((key) => {
        sum += Number(t[key] || 0);
      });
      if (sum > maxVal) maxVal = sum;
    });
    maxVal = Math.ceil(maxVal * 1.1);

    const getX = (index: number) => {
      const step = (width - padding.left - padding.right) / trends.length;
      return padding.left + index * step;
    };

    const getY = (value: number) => {
      const scale = (height - padding.top - padding.bottom) / maxVal;
      return height - padding.bottom - value * scale;
    };

    const barWidth = Math.max(6, (width - padding.left - padding.right) / trends.length - 8);

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 overflow-visible">
          {/* Y Axis Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const val = Math.round(maxVal * p);
            const y = getY(val);
            return (
              <g key={i}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255,255,255,0.03)" />
                <text x={padding.left - 8} y={y + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end" className="font-mono">
                  ₹{val}
                </text>
              </g>
            );
          })}

          {/* Bar Rectangles */}
          {trends.map((t, idx) => {
            const x = getX(idx);
            let accumulatedY = height - padding.bottom;

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  setHoveredIndex(idx);
                  setTooltipPos({
                    x: x + barWidth / 2,
                    y: getY(keys.reduce((sum, key) => sum + Number(t[key] || 0), 0)) - 10,
                  });
                }}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {keys.map((key, kIdx) => {
                  const val = Number(t[key] || 0);
                  const scale = (height - padding.top - padding.bottom) / maxVal;
                  const barHeight = val * scale;
                  const barY = accumulatedY - barHeight;
                  accumulatedY = barY;

                  return (
                    <rect
                      key={key}
                      x={x}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      fill={colors[kIdx]}
                      rx="2"
                      className="transition-all duration-300 hover:brightness-110"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Dates X axis */}
          {trends.map((t, idx) => {
            if (trends.length > 10 && idx % Math.ceil(trends.length / 5) !== 0) return null;
            const x = getX(idx) + barWidth / 2;
            return (
              <text
                key={idx}
                x={x}
                y={height - 10}
                fill="rgba(255,255,255,0.3)"
                fontSize="9"
                textAnchor="middle"
                className="font-semibold"
              >
                {new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </text>
            );
          })}
        </svg>

        {hoveredIndex !== null && trends[hoveredIndex] && (
          <div
            className="absolute bg-[#1a1a24] border border-white/10 px-3 py-2 rounded-xl text-[11px] text-white pointer-events-none shadow-2xl backdrop-blur-md flex flex-col gap-1 -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(tooltipPos.x / width) * 100}%`,
              top: `${(tooltipPos.y / height) * 100}%`,
            }}
          >
            <p className="font-bold text-white/40 mb-0.5">
              {new Date(trends[hoveredIndex].date).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            </p>
            {keys.map((key, idx) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[idx] }} />
                <span className="font-semibold text-white/70">{labels[idx]}:</span>
                <span className="font-mono font-bold text-white ml-auto">
                  ₹{trends[hoveredIndex][key]}
                </span>
              </div>
            ))}
            <div className="border-t border-white/5 mt-1 pt-1 flex justify-between font-bold text-violet-400">
              <span>Gross:</span>
              <span>₹{keys.reduce((sum, key) => sum + Number(trends[hoveredIndex][key] || 0), 0)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Custom SVG Donut Chart for Revenue breakdown
  const renderDonutChart = (catData: { category: string; revenue: number }[]) => {
    if (!catData || catData.length === 0) {
      return (
        <div className="h-48 flex items-center justify-center text-white/20 text-sm">
          No category distribution.
        </div>
      );
    }

    const total = catData.reduce((sum, c) => sum + c.revenue, 0);
    const radius = 50;
    const strokeWidth = 14;
    const circ = 2 * Math.PI * radius;

    let accumulatedPercentage = 0;
    const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];

    return (
      <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
        <div className="relative w-36 h-36">
          <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
            <circle cx="60" cy="60" r={radius} fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth={strokeWidth} />
            {catData.map((c, idx) => {
              const share = c.revenue / (total || 1);
              const strokeOffset = circ - share * circ;
              const strokeDash = accumulatedPercentage * circ;
              accumulatedPercentage += share;
              return (
                <circle
                  key={c.category}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="transparent"
                  stroke={colors[idx % colors.length]}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circ}
                  strokeDashoffset={strokeOffset}
                  transform={`rotate(${(strokeDash / circ) * 360} 60 60)`}
                  strokeLinecap="round"
                  className="transition-all duration-500 cursor-pointer"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-[10px] uppercase font-black text-white/30 tracking-widest leading-none">Total</p>
            <p className="text-base font-black text-white tracking-tighter mt-1">₹{total}</p>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-2 flex-1">
          {catData.map((c, idx) => {
            const percentage = total > 0 ? Math.round((c.revenue / total) * 100) : 0;
            return (
              <div key={c.category} className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }} />
                  <span className="capitalize text-white/70">{c.category}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-white/40">({percentage}%)</span>
                  <span className="font-mono font-bold text-white">₹{c.revenue}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Speedometer Gauge Component for Completion and Response rate targets
  const renderGauge = (value: number, max: number, label: string, color: string, unit: string = '%') => {
    const angleRange = 180;
    const rotation = (Math.min(value, max) / max) * angleRange - 90;

    return (
      <div className="flex flex-col items-center justify-center bg-[#14141b] border border-white/5 rounded-2xl p-4 text-center">
        <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-3">{label}</p>
        <div className="relative w-32 h-20 overflow-hidden flex items-end justify-center">
          <svg className="w-full h-full transform -rotate-180 scale-x-[-1]" viewBox="0 0 100 50">
            {/* Background semi-circle */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Value semi-circle */}
            <path
              d="M 10 50 A 40 40 0 0 1 90 50"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeDasharray="125.6"
              strokeDashoffset={125.6 - (Math.min(value, max) / max) * 125.6}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center flex flex-col justify-end">
            <span className="text-lg font-black text-white leading-none">
              {value}
              <span className="text-xs font-semibold text-white/50 ml-0.5">{unit}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Filters Console */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between p-4 bg-[#0f0f13] border border-white/5 rounded-3xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Filter size={16} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">Metrics Scoping</h3>
            <p className="text-[10px] text-white/30 font-semibold -mt-0.5">Filter telemetry pipeline</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-2">
          {/* City Selection */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-black uppercase text-white/30 tracking-widest pl-1">City</span>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="bg-[#14141b] border border-white/5 rounded-xl text-xs font-bold text-white px-3 py-2 outline-none focus:border-violet-500/30 transition-colors"
            >
              <option value="all">All Cities</option>
              <option value="bhilwara">Bhilwara</option>
            </select>
          </div>

          {/* Category Selection */}
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-black uppercase text-white/30 tracking-widest pl-1">Category</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#14141b] border border-white/5 rounded-xl text-xs font-bold text-white px-3 py-2 outline-none focus:border-violet-500/30 transition-colors"
            >
              <option value="all">All Categories</option>
              <option value="electrician">Electrician</option>
              <option value="plumber">Plumber</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="border-b border-white/5 flex gap-2 overflow-x-auto pb-px">
        {[
          { id: 'bookings', label: 'Bookings', icon: Calendar },
          { id: 'revenue', label: 'Revenue & Fees', icon: Wallet },
          { id: 'workers', label: 'Worker Perf', icon: Wrench },
          { id: 'customers', label: 'Clients', icon: Users },
          { id: 'fraud', label: 'Fraud & Risks', icon: Shield, badge: data.fraud.length || undefined },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2.5 px-4 py-3 border-b-2 text-xs font-bold transition-all whitespace-nowrap -mb-px ${
                isActive
                  ? 'border-violet-500 text-violet-400 bg-violet-500/5'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:bg-white/2'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="h-4 px-1.5 rounded-full bg-red-500 text-[8px] font-black text-white flex items-center justify-center animate-pulse">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dynamic Content Rendering */}
      <div className="space-y-6">
        {/* ==================== 1. BOOKINGS TAB ==================== */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            {/* Stat row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Total Bookings</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white tracking-tight">{data.bookings.total_bookings}</span>
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                    <TrendingUp size={10} /> 12%
                  </span>
                </div>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                  <Calendar size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Completion Rate</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white tracking-tight">{data.bookings.completion_rate}%</span>
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                    <TrendingUp size={10} /> 3%
                  </span>
                </div>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <CheckCircle size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Cancellation Rate</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white tracking-tight">{data.bookings.cancellation_rate}%</span>
                  <span className="text-[10px] font-bold text-red-400 flex items-center gap-0.5">
                    <TrendingDown size={10} /> 4%
                  </span>
                </div>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                  <AlertTriangle size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Avg Response Time</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white tracking-tight">
                    {Math.round(data.bookings.avg_response_time_seconds / 60) || 1}
                  </span>
                  <span className="text-xs font-bold text-white/40">mins</span>
                </div>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <Clock size={15} />
                </div>
              </div>
            </div>

            {/* Graphs grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#0f0f13] border border-white/5 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Booking Velocity</h3>
                    <p className="text-[10px] text-white/30 font-semibold -mt-0.5">Daily order dispatch volumes</p>
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-4 text-[10px] font-bold">
                    <div className="flex items-center gap-1.5 text-violet-400">
                      <span className="w-2 h-2 rounded-full bg-violet-500" /> Total
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed
                    </div>
                    <div className="flex items-center gap-1.5 text-red-400">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> Cancelled
                    </div>
                  </div>
                </div>
                {renderLineChart(
                  data.bookings.daily_trends,
                  ['total', 'completed', 'cancelled'],
                  ['Total Bookings', 'Completed', 'Cancelled'],
                  ['#8b5cf6', '#10b981', '#ef4444']
                )}
              </div>

              {/* Targets / Gauges */}
              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">SLA Target Consoles</h3>
                  <p className="text-[10px] text-white/30 font-semibold mb-6 -mt-0.5">Performance tracking vs target thresholds</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {renderGauge(data.bookings.completion_rate, 100, 'Completion target', '#10b981')}
                  {renderGauge(
                    Math.round(data.bookings.avg_response_time_seconds / 60) || 1,
                    15,
                    'Response target',
                    '#f59e0b',
                    'm'
                  )}
                </div>
                <div className="border-t border-white/5 pt-4 mt-4 text-[10px] font-semibold text-white/40 flex items-center gap-2">
                  <Info size={12} className="text-violet-400" />
                  <span>Target SLA response: under 5 minutes. Target completion rate: 90%.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2. REVENUE TAB ==================== */}
        {activeTab === 'revenue' && (
          <div className="space-y-6">
            {/* Stat Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Gross Transactions (GMV)</p>
                <span className="text-3xl font-black text-white tracking-tight">₹{data.revenue.total_revenue}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                  <TrendingUp size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Platform Revenue (Commission)</p>
                <span className="text-3xl font-black text-white tracking-tight">₹{data.revenue.platform_revenue}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <Wallet size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Worker Net Share (Earnings)</p>
                <span className="text-3xl font-black text-white tracking-tight">₹{data.revenue.worker_earnings}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <ThumbsUp size={15} />
                </div>
              </div>
            </div>

            {/* Graphs Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#0f0f13] border border-white/5 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Revenue Stream Trends</h3>
                    <p className="text-[10px] text-white/30 font-semibold -mt-0.5">Platform commissions vs worker payouts</p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-bold">
                    <div className="flex items-center gap-1.5 text-violet-400">
                      <span className="w-2 h-2 rounded-full bg-violet-500" /> Platform Fee
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Worker Earnings
                    </div>
                  </div>
                </div>
                {renderBarChart(
                  data.revenue.daily_trends,
                  ['platform', 'worker'],
                  ['Platform Commission', 'Worker Share'],
                  ['#8b5cf6', '#10b981']
                )}
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Category Contribution</h3>
                  <p className="text-[10px] text-white/30 font-semibold mb-6 -mt-0.5">Revenue breakdown by service type</p>
                </div>
                {renderDonutChart(data.revenue.category_distribution)}
                <div className="border-t border-white/5 pt-4 mt-4 text-[10px] font-semibold text-white/40 flex items-center gap-2">
                  <MapPin size={12} className="text-violet-400" />
                  <span>Configured platform commission rate: 10% on service charges.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 3. WORKERS TAB ==================== */}
        {activeTab === 'workers' && (
          <div className="space-y-6">
            {/* Stat Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Active Partners</p>
                <span className="text-3xl font-black text-white tracking-tight">{data.workers.total_workers}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                  <Wrench size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Average Worker Rating</p>
                <span className="text-3xl font-black text-white tracking-tight">⭐ {data.workers.avg_rating}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <Info size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Average Acceptance Rate</p>
                <span className="text-3xl font-black text-white tracking-tight">{data.workers.avg_acceptance_rate}%</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <CheckCircle size={15} />
                </div>
              </div>
            </div>

            {/* Workers Table */}
            <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-6 overflow-hidden">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider mb-1">Top Performing Professionals</h3>
                <p className="text-[10px] text-white/30 font-semibold mb-6">Ranked by volume of completed dispatches</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-semibold">
                  <thead>
                    <tr className="text-white/30 border-b border-white/5 text-[9px] uppercase tracking-widest font-black">
                      <th className="pb-3 pl-2">Name</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3">Rating</th>
                      <th className="pb-3">Completed Jobs</th>
                      <th className="pb-3 pr-2">Acceptance Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/80">
                    {data.workers.top_performing.map((w) => (
                      <tr key={w.worker_id} className="hover:bg-white/2 transition-colors">
                        <td className="py-3 pl-2 font-bold text-white">{w.name}</td>
                        <td className="py-3 capitalize">{w.category}</td>
                        <td className="py-3">⭐ {w.avg_rating.toFixed(1)}</td>
                        <td className="py-3 font-mono font-bold text-white">{w.jobs_completed}</td>
                        <td className="py-3 font-mono pr-2 text-violet-400">
                          {Math.round(w.acceptance_rate * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 4. CUSTOMERS TAB ==================== */}
        {activeTab === 'customers' && (
          <div className="space-y-6">
            {/* Stat Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Registered Clients</p>
                <span className="text-3xl font-black text-white tracking-tight">{data.customers.total_customers}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                  <Users size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Active Clients</p>
                <span className="text-3xl font-black text-white tracking-tight">{data.customers.active_customers}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <CheckCircle size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Repeat Clients</p>
                <span className="text-3xl font-black text-white tracking-tight">{data.customers.repeat_customers}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  <TrendingUp size={15} />
                </div>
              </div>

              <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
                <p className="text-[10px] font-black uppercase text-white/30 tracking-widest mb-1.5">Booking Frequency</p>
                <span className="text-3xl font-black text-white tracking-tight">{data.customers.booking_frequency}</span>
                <div className="absolute right-4 bottom-4 h-8 w-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                  <Info size={15} />
                </div>
              </div>
            </div>

            {/* Retention Funnel */}
            <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-6">
              <div className="mb-6">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Customer Engagement Funnel</h3>
                <p className="text-[10px] text-white/30 font-semibold -mt-0.5">Telemetry tracking cohort user lifecycle</p>
              </div>

              <div className="space-y-4 max-w-xl mx-auto py-4">
                {/* Step 1: Registered */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-white/60">Registered Customers</span>
                    <span className="text-white font-mono font-bold">{data.customers.total_customers}</span>
                  </div>
                  <div className="h-5 bg-white/3 rounded-lg overflow-hidden border border-white/5">
                    <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-lg w-full flex items-center pl-3 text-[9px] font-bold text-white">
                      100% Base cohort
                    </div>
                  </div>
                </div>

                {/* Step 2: Booked */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-white/60">Active Booking Customers (At least 1 Booking)</span>
                    <span className="text-white font-mono font-bold">
                      {data.customers.active_customers}
                      <span className="text-[10px] text-white/40 ml-1">
                        ({Math.round((data.customers.active_customers / (data.customers.total_customers || 1)) * 100)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-5 bg-white/3 rounded-lg overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-blue-600 to-cyan-500 rounded-lg flex items-center pl-3 text-[9px] font-bold text-white"
                      style={{
                        width: `${Math.max(15, (data.customers.active_customers / (data.customers.total_customers || 1)) * 100)}%`,
                      }}
                    >
                      {Math.round((data.customers.active_customers / (data.customers.total_customers || 1)) * 100)}% Conversion
                    </div>
                  </div>
                </div>

                {/* Step 3: Repeat */}
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-white/60">Loyal / Repeat Customers (Multiple Bookings)</span>
                    <span className="text-white font-mono font-bold">
                      {data.customers.repeat_customers}
                      <span className="text-[10px] text-white/40 ml-1">
                        ({Math.round((data.customers.repeat_customers / (data.customers.total_customers || 1)) * 100)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-5 bg-white/3 rounded-lg overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 rounded-lg flex items-center pl-3 text-[9px] font-bold text-white"
                      style={{
                        width: `${Math.max(15, (data.customers.repeat_customers / (data.customers.total_customers || 1)) * 100)}%`,
                      }}
                    >
                      {Math.round((data.customers.repeat_customers / (data.customers.total_customers || 1)) * 100)}% Retention
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 5. FRAUD TAB ==================== */}
        {activeTab === 'fraud' && (
          <div className="space-y-6">
            <div className="bg-[#0f0f13] border border-white/5 rounded-3xl p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Fraud & Risk Console</h3>
                  <p className="text-[10px] text-white/30 font-semibold -mt-0.5">Real-time alerts generated from telemetry heuristics</p>
                </div>
                <div className="h-6 px-2.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-black text-red-400 flex items-center gap-1.5 animate-pulse">
                  <Shield size={10} />
                  <span>{data.fraud.length} Warnings Active</span>
                </div>
              </div>

              {data.fraud.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                  <CheckCircle size={32} className="text-emerald-500" />
                  <div>
                    <p className="text-sm font-bold text-white">Security Clean</p>
                    <p className="text-xs text-white/40 max-w-sm mt-0.5">
                      No suspicious cancellations, fake booking velocities, or OTP locks detected.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.fraud.map((flag) => {
                    const severityColors: Record<string, string> = {
                      low: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
                      medium: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
                      high: 'bg-red-500/10 border-red-500/20 text-red-400',
                      critical: 'bg-red-500/25 border-red-500/40 text-red-300',
                    };
                    return (
                      <div
                        key={flag.id}
                        className="bg-[#14141b] border border-white/5 hover:border-white/10 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${severityColors[flag.severity] || severityColors.low}`}>
                              {flag.severity}
                            </span>
                            <span className="text-[10px] font-bold text-white/40">
                              {flag.flag_type.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] text-white/20 font-semibold">
                              {new Date(flag.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-white/80">{flag.description}</p>
                          {flag.evidence && Object.keys(flag.evidence).length > 0 && (
                            <pre className="text-[9px] font-mono text-white/30 bg-[#0f0f13] p-2 rounded-lg max-w-md overflow-x-auto border border-white/5">
                              {JSON.stringify(flag.evidence, null, 2)}
                            </pre>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            className="px-3 py-1.5 rounded-xl border border-white/5 hover:bg-white/5 text-[10px] font-bold text-white/60 hover:text-white transition-colors"
                            onClick={() => alert('Review action simulated')}
                          >
                            Review Event
                          </button>
                          {flag.status === 'open' && (
                            <button
                              className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-[10px] font-black text-white transition-colors flex items-center gap-1"
                              onClick={() => alert('Resolve action simulated')}
                            >
                              Dismiss Alert
                              <ArrowRight size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
