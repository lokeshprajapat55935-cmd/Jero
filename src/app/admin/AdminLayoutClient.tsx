'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/admin/live', label: 'Live Ops', icon: Activity, badge: 'live' },
  { href: '/admin/workers', label: 'Workers', icon: Wrench },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/bookings', label: 'Bookings', icon: Calendar },
  { href: '/admin/wallets', label: 'Wallets', icon: Wallet },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: Wallet },
  { href: '/admin/disputes', label: 'Disputes', icon: AlertTriangle },
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
  { href: '/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

function AdminSidebar({ adminRole, onClose }: { adminRole: string; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/admin-auth/logout', { method: 'POST' });
      window.location.href = '/admin-login';
    } catch (e) {
      console.error('Logout failed', e);
    }
  };

  // Only super_admin accounts can access the dashboard now.
  const allowedItems = NAV_ITEMS;

  return (
    <aside className="flex flex-col h-full bg-[#0a0a0f]/95 backdrop-blur-xl border-r border-white/[0.05] shadow-2xl">
      {/* Logo Area */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.05] bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.3)] border border-white/10">
            <Shield size={18} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">Jero</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-0.5">Ops Center</span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-hide">
        {allowedItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 group relative overflow-hidden',
                isActive
                  ? 'text-white bg-gradient-to-r from-red-500/10 to-transparent border border-red-500/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]'
                  : 'text-white/40 hover:text-white/90 hover:bg-white/5 border border-transparent'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-r-full shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
              )}
              <Icon
                size={18}
                className={cn(
                  'shrink-0 transition-colors duration-300',
                  isActive ? 'text-red-400' : 'text-white/30 group-hover:text-white/50'
                )}
              />
              <span className="truncate tracking-wide">{item.label}</span>
              {item.badge === 'live' && (
                <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.5)]" />
                  Live
                </span>
              )}
              {isActive && !item.badge && (
                <ChevronRight size={14} className="ml-auto text-red-400/50" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className="p-4 border-t border-white/[0.05] bg-black/20 backdrop-blur-md">
        <div className="mb-4 px-2">
          <p className="text-[10px] text-white/30 font-bold uppercase tracking-wider mb-1">Session Level</p>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <p className="text-xs text-red-400 font-black uppercase tracking-wider">Super Admin</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all text-sm font-bold text-red-400 hover:text-red-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
        >
          <LogOut size={16} />
          <span>Secure Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default function AdminLayoutClient({ children, adminRole }: { children: React.ReactNode, adminRole: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[#0a0a0e] flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-56 shrink-0 fixed inset-y-0 left-0 z-30">
        <AdminSidebar adminRole={adminRole} />
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
        <AdminSidebar adminRole={adminRole} onClose={() => setSidebarOpen(false)} />
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
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
              <Shield size={12} className="text-white" />
            </div>
            <span className="text-sm font-black text-white tracking-tight">Jero Admin</span>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 p-5 lg:p-7 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
