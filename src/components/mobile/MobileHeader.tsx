"use client";

import { MapPin, Bell } from "lucide-react";
import { useUser } from "@/providers/UserProvider";
import { useCity } from "@/providers/CityProvider";
import { Avatar } from "@/components/ui/avatar";
import Link from "next/link";
import { ROUTES } from "@/lib/constants";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useI18n } from "@/providers/I18nProvider";
import { ClientOnly } from "@/components/shared/ClientOnly";
import { cn } from "@/lib/utils";

export function MobileHeader() {
  const { user, profile } = useUser();
  const { activeCity } = useCity();
  const { t } = useI18n();

  const cityLabel = activeCity?.name ?? t("nav.defaultCity");
  const profileHref = user ? ROUTES.PROFILE : ROUTES.AUTH.LOGIN;

  return (
    <header className="glass sticky top-0 z-40 w-full max-w-[100vw] border-b border-border/50 pt-safe lg:hidden">
      <div className="flex h-14 min-w-0 items-center justify-between gap-2 px-3 sm:px-4">
        <ClientOnly fallback={
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/10">
              <img
                src="https://avatar.vercel.sh/guest"
                alt="Guest"
                width={36}
                height={36}
                className="h-full w-full object-cover"
              />
            </Avatar>
            <div className="min-w-0 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("nav.hello")}
              </span>
              <span className="truncate text-sm font-black tracking-tight">Guest</span>
            </div>
          </div>
        }>
          <Link href={profileHref} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/10">
              <img
                src={profile?.avatar_url || `https://avatar.vercel.sh/${user?.email || "guest"}`}
                alt={profile?.full_name || "User"}
                width={36}
                height={36}
                className="h-full w-full object-cover"
              />
            </Avatar>
            <div className="min-w-0 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("nav.hello")}
              </span>
              <span className="truncate text-sm font-black tracking-tight">
                {profile?.full_name?.split(" ")[0] || "Guest"}
              </span>
            </div>
          </Link>
        </ClientOnly>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ClientOnly fallback={
            <button
              type="button"
              className={cn(
                "flex max-w-[6.5rem] items-center gap-1 rounded-full border border-border/50",
                "bg-secondary/50 px-2 py-1.5 transition-colors active:scale-95 sm:max-w-[8rem] sm:px-3"
              )}
              aria-label={t("nav.defaultCity")}
            >
              <MapPin size={12} className="shrink-0 text-primary" />
              <span className="truncate text-[10px] font-bold sm:text-[11px]">{t("nav.defaultCity")}</span>
            </button>
          }>
            <button
              type="button"
              className={cn(
                "flex max-w-[6.5rem] items-center gap-1 rounded-full border border-border/50",
                "bg-secondary/50 px-2 py-1.5 transition-colors active:scale-95 sm:max-w-[8rem] sm:px-3"
              )}
              aria-label={cityLabel}
            >
              <MapPin size={12} className="shrink-0 text-primary" />
              <span className="truncate text-[10px] font-bold sm:text-[11px]">{cityLabel}</span>
            </button>
          </ClientOnly>
          <LanguageSwitcher compact />
          <button
            type="button"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/50 bg-secondary/50 transition-colors active:scale-95"
            aria-label="Notifications"
          >
            <Bell size={20} />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-background bg-primary" />
          </button>
        </div>
      </div>
    </header>
  );
}
