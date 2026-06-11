"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, CalendarClock, User } from "lucide-react";
import { ROUTES } from "@/lib/constants";

export function CustomerBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: ROUTES.DASHBOARD, icon: Home, label: "Home" },
    { href: ROUTES.SEARCH, icon: Search, label: "Search" },
    { href: ROUTES.ACTIVITY, icon: CalendarClock, label: "Activity" },
    { href: ROUTES.PROFILE, icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 pb-safe z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="max-w-md mx-auto flex justify-between items-center px-6 h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex flex-col items-center justify-center w-full space-y-1 transition-colors ${
                isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
