import React from "react";
import { cookies } from "next/headers";
import "@/app/globals.css";
import localFont from "next/font/local";
import { Providers } from "@/providers";
import { AppChrome } from "@/components/shared/AppChrome";
import { SafeErrorBoundary } from "@/components/shared/SafeErrorBoundary";
import { ThemeScript } from "@/components/shared/ThemeScript";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const inter = localFont({
  src: [
    {
      path: "../../public/fonts/Inter-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/Inter-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/Inter-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/Inter-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

const notoDevaragari = localFont({
  src: [
    {
      path: "../../public/fonts/NotoSansDevanagari-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/NotoSansDevanagari-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/NotoSansDevanagari-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/NotoSansDevanagari-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-noto",
  display: "swap",
});

export const viewport = {
  themeColor: "#14826f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export const metadata = {
  title: {
    default: "Zolvo - Local Services Marketplace",
    template: "%s | Zolvo",
  },
  description: "Find and book trusted local professionals (electricians and plumbers) in Bhilwara in minutes.",
  keywords: ["Zolvo", "Bhilwara", "local services", "electrician", "plumber", "home services", "hire local", "Rajasthan"],
  authors: [{ name: "Zolvo Team" }],
  creator: "Zolvo Team",
  publisher: "Zolvo",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Zolvo",
  },
  applicationName: "Zolvo",
  alternates: {
    languages: {
      en: "/?lang=en",
      hi: "/?lang=hi",
    },
  },
  openGraph: {
    title: "Zolvo - Local Worker Marketplace",
    description: "Find and book trusted local professionals in Bhilwara with ease.",
    url: "https://zolvo.in",
    siteName: "Zolvo",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Zolvo - Local Worker Marketplace",
    description: "Find and book trusted local professionals in Bhilwara with ease.",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("zolvo-locale")?.value;
  const initialLocale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;

  return (
    <html
      lang={initialLocale}
      data-locale={initialLocale}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={cn(inter.variable, notoDevaragari.variable)}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen overflow-x-hidden antialiased bg-background text-foreground font-sans" suppressHydrationWarning>
        <Providers initialLocale={initialLocale}>
          <SafeErrorBoundary>
            <AppChrome>{children}</AppChrome>
          </SafeErrorBoundary>
        </Providers>
      </body>
    </html>
  );
}
