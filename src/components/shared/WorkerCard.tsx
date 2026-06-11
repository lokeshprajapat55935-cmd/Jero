"use client";

import React, { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Star, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Worker } from "@/types";
import { cn, formatCurrency } from "@/lib/utils";
import { useI18n } from "@/providers/I18nProvider";

interface WorkerCardProps {
  worker: Worker;
  className?: string;
}

function WorkerCardBase({ worker, className }: WorkerCardProps) {
  const { t, categoryName } = useI18n();
  const name = worker.profile?.full_name || worker.name || "Professional";
  const avatar = worker.profile?.avatar_url || worker.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${worker.id}`;
  const rating = worker.rating_avg || worker.rating || 0;
  const baseRate = worker.base_service_charge || 0;
  const visitRate = worker.visit_charge || 0;

  return (
    <Link href={`/worker/${worker.id}`} className="block group">
      <Card className={cn("flex items-center gap-4 p-4 border border-border bg-card text-card-foreground transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.99] rounded-2xl", className)}>
        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-border shadow-sm">
          <Image 
            src={avatar} 
            alt={name} 
            fill
            sizes="64px"
            className="object-cover grayscale-[0.2] transition group-hover:grayscale-0" 
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="truncate pr-2 text-sm font-bold text-foreground leading-none">{name}</h4>
            <div className="flex items-center gap-1">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              <span className="text-xs font-bold text-foreground">{typeof rating === "number" ? rating.toFixed(1) : rating}</span>
            </div>
          </div>

          <p className="text-xs font-semibold text-muted-foreground mb-3 truncate uppercase tracking-wider">
            {categoryName(worker.category)} · {worker.experience_years || 0}y exp
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground leading-none">
                {formatCurrency(baseRate + visitRate)}
                <span className="text-[10px] font-semibold text-muted-foreground ml-1">cash</span>
              </span>
              {worker.verified && (
                <div className="h-4 w-4 flex items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck size={12} />
                </div>
              )}
            </div>
            {worker.service_area && (
              <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 italic">
                <MapPin size={10} className="text-muted-foreground/60" /> {worker.service_area}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export const WorkerCard = memo(WorkerCardBase);
