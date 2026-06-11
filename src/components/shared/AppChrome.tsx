"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/shared/Navbar";
import { BottomNav } from "@/components/mobile/BottomNav";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PageTransition } from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/" || pathname.includes("/login") || pathname.includes("/apply");
  const isClientRoute = pathname.startsWith("/client");

  return (
    <div className="flex min-h-screen w-full max-w-[100vw] flex-col overflow-x-hidden">
      {!isAuthPage && isClientRoute && (
        <>
          <div className="hidden lg:block">
            <Navbar />
          </div>
          <MobileHeader />
        </>
      )}
      <main
        className={cn(
          "flex-1 w-full min-w-0 overflow-x-hidden",
          isAuthPage ? "min-h-screen" : isClientRoute ? "mobile-chrome-pad lg:pb-0" : ""
        )}
      >
        <PageTransition>{children}</PageTransition>
      </main>
      {!isAuthPage && isClientRoute && <BottomNav />}
    </div>
  );
}
