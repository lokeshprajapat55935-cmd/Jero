"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Search, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useI18n } from "@/providers/I18nProvider";

const navItems = [
  { icon: Home, label: "Home", href: ROUTES.CLIENT_HOME },
  { icon: Search, label: "Search", href: ROUTES.CLIENT_SEARCH },
  { icon: Calendar, label: "Activity", href: ROUTES.CLIENT_BOOKINGS },
  { icon: User, label: "Profile", href: ROUTES.CLIENT_PROFILE },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const labels = useMemo<Record<(typeof navItems)[number]["label"], string>>(
    () => ({
      Home: t("common.home"),
      Search: t("common.search"),
      Activity: t("common.activity"),
      Profile: t("common.profile"),
    }),
    [t]
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 w-full max-w-[100vw] glass border-t border-border/50 pb-safe lg:hidden">
      <nav className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className="relative flex flex-col items-center justify-center">
                <Icon
                  size={23}
                  className={cn("z-10 transition-transform duration-300", isActive && "scale-110")}
                />
                <span className="mt-0.5 max-w-full truncate text-[10px] font-bold">
                  {labels[item.label]}
                </span>

                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute -inset-x-3 -inset-y-1 -z-0 rounded-full bg-primary/10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
