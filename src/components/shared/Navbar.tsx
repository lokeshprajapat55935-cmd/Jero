"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useUser } from "@/providers/UserProvider";
import { ROUTES } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { useI18n } from "@/providers/I18nProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocationBadge } from "@/components/shared/LocationBanner";
import { ClientOnly } from "@/components/shared/ClientOnly";

export const Navbar = () => {
  const { user, profile, signOut } = useUser();
  const { t } = useI18n();

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <nav className="glass sticky top-0 z-50 w-full border-b border-border/60">
      <div className="app-shell flex h-16 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-8">
          <Link
            href={ROUTES.HOME}
            className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-foreground"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground shadow-lift">
              Z
            </span>
            <span className="truncate">{t("app.name")}</span>
          </Link>
          <LocationBadge />
          <div className="hidden items-center gap-6 lg:flex">
            <Link
              href={ROUTES.CLIENT_SEARCH || '/search'}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {t("common.findWorkers")}
            </Link>
            <Link
              href={ROUTES.CLIENT_SEARCH || '/search'}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {t("common.categories")}
            </Link>
            <Link
              href="/emergency"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {t("common.howItWorks")}
            </Link>
            <Link
              href="/partner"
              className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              Become a Partner
            </Link>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <LanguageSwitcher />
          <ClientOnly fallback={
            <>
              <Link href={ROUTES.AUTH.LOGIN}>
                <Button variant="ghost" size="sm" className="text-sm font-semibold">
                  {t("common.login")}
                </Button>
              </Link>
              <Link href={ROUTES.AUTH.LOGIN}>
                <Button size="sm" className="text-sm font-semibold">
                  {t("common.joinAsPro")}
                </Button>
              </Link>
            </>
          }>
            {user ? (
              <div className="flex items-center gap-3">
                <Link href={ROUTES.ACTIVITY}>
                  <Button variant="ghost" size="sm" className="text-sm font-semibold">
                    {t("nav.myBookings")}
                  </Button>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                      <Avatar className="h-10 w-10 ring-2 ring-primary/10">
                        <img
                          src={profile?.avatar_url || `https://avatar.vercel.sh/${user.email}`}
                          alt={profile?.full_name || "User"}
                        />
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{profile?.full_name || "User"}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={ROUTES.PROFILE}>{t("nav.profileSettings")}</Link>
                    </DropdownMenuItem>
                    {profile?.role === "worker" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/worker/dashboard">{t("nav.myWorkerProfile")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/worker/dashboard">🎯 Partner Dashboard</Link>
                        </DropdownMenuItem>
                      </>
                    )}
                    {profile?.role === "admin" && (
                      <DropdownMenuItem asChild>
                        <Link href="/admin">{t("nav.adminPanel")}</Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={handleLogout}
                    >
                      {t("common.logout")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <>
                <Link href={ROUTES.AUTH.LOGIN}>
                  <Button variant="ghost" size="sm" className="text-sm font-semibold">
                    {t("common.login")}
                  </Button>
                </Link>
                <Link href={ROUTES.AUTH.LOGIN}>
                  <Button size="sm" className="text-sm font-semibold">
                    {t("common.joinAsPro")}
                  </Button>
                </Link>
              </>
            )}
          </ClientOnly>
        </div>
      </div>
    </nav>
  );
};
