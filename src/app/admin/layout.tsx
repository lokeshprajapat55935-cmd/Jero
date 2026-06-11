'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import {
  Activity,
  Users,
  Wrench,
  Calendar,
  Wallet,
  AlertTriangle,
  Bell,
  BarChart3,
  Shield,
  Settings,
  Menu,
  X,
  AlertOctagon,
  ChevronRight,
  ScrollText,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { useUser } from '@/providers/UserProvider';

const NAV_ITEMS = [
  { href: '/admin/live', label: 'Live Ops', icon: Activity, badge: 'live' },
  { href: '/admin/beta', label: 'Beta Center', icon: Activity },
  { href: '/admin/workers', label: 'Workers', icon: Wrench },
  { href: '/admin/clients', label: 'Clients', icon: Users },
  { href: '/admin/bookings', label: 'Bookings', icon: Calendar },
  { href: '/admin/finance', label: 'Finance', icon: Wallet },
  { href: '/admin/disputes', label: 'Disputes', icon: AlertTriangle },
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/fraud', label: 'Fraud Monitor', icon: Shield },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

function AdminSidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { profile } = useUser();
  const adminRole = profile?.admin_role ?? 'super_admin';

  const allowedItems = NAV_ITEMS.filter((item) => {
    if (adminRole === 'support_admin') {
      // Support Executive permissions
      return !['/admin/finance', '/admin/analytics', '/admin/fraud', '/admin/audit', '/admin/settings'].includes(item.href);
    }
    if (adminRole === 'operations_admin') {
      // Operations Manager permissions
      return !['/admin/audit', '/admin/settings'].includes(item.href);
    }
    if (adminRole === 'finance_admin') {
      return ['/admin/finance', '/admin/analytics', '/admin/settings'].includes(item.href);
    }
    return true; // super_admin has full access
  });

  return (
    <aside className="flex flex-col h-full bg-[#0f0f13] border-r border-white/8">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <AlertOctagon size={16} className="text-white" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-violet-400">Zolvo</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 -mt-0.5">Admin Console</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all group',
                isActive
                  ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5 border border-transparent'
              )}
            >
              <Icon
                size={16}
                className={cn(
                  'shrink-0 transition-colors',
                  isActive ? 'text-violet-400' : 'text-white/30 group-hover:text-white/60'
                )}
              />
              <span className="truncate">{item.label}</span>
              {item.badge === 'live' && (
                <span className="ml-auto flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live
                </span>
              )}
              {isActive && !item.badge && (
                <ChevronRight size={12} className="ml-auto text-violet-400/60" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Emergency link */}
      <div className="p-3 border-t border-white/8">
        <Link
          href="/admin/emergency"
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-all text-sm font-bold"
        >
          <AlertOctagon size={15} className="animate-pulse" />
          <span>Dispatch Monitor</span>
        </Link>
      </div>
    </aside>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  const pathname = usePathname();
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <AuthGate allowedRoles={['admin']}>
      <div className="min-h-screen bg-[#0a0a0e] flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex lg:flex-col lg:w-56 shrink-0 fixed inset-y-0 left-0 z-30">
          <AdminSidebar />
        </div>

        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-64 flex flex-col lg:hidden transition-transform duration-300',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <AdminSidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main Content */}
        <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
          {/* Top bar (mobile) */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[#0f0f13] border-b border-white/8 sticky top-0 z-20">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-white/60 hover:text-white p-1 transition-colors"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <AlertOctagon size={12} className="text-white" />
              </div>
              <span className="text-sm font-black text-white tracking-tight">Zolvo Admin</span>
            </div>
          </div>

          {/* Page Content */}
          <main className="flex-1 p-5 lg:p-7 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
