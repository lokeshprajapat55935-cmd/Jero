"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  /** Page title displayed next to the back arrow */
  title: string;
  /** Back link destination — defaults to /profile */
  backHref?: string;
}

/**
 * Shared page header with back-arrow and title.
 * Used across all profile subpages (edit, help, history, notifications, etc.)
 */
export function PageHeader({ title, backHref = "/profile" }: PageHeaderProps) {
  return (
    <header className="flex items-center gap-4 mb-4">
      <Link href={backHref}>
        <Button variant="ghost" size="icon" className="rounded-full bg-secondary/50">
          <ArrowLeft size={20} />
        </Button>
      </Link>
      <h1 className="text-2xl font-bold">{title}</h1>
    </header>
  );
}
