"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOCALES, localeLabels } from "@/lib/i18n/config";
import { useI18n } from "@/providers/I18nProvider";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  compact?: boolean;
  className?: string;
};

export function LanguageSwitcher({ compact = false, className }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm", className)}
      aria-label={t("common.language")}
    >
      {!compact && <Languages className="ml-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      {LOCALES.map((item) => {
        const active = item === locale;
        return (
          <Button
            key={item}
            type="button"
            variant={active ? "default" : "ghost"}
            size="sm"
            className={cn("h-8 px-2.5 text-xs", active && "shadow-none")}
            onClick={() => setLocale(item)}
            aria-pressed={active}
            title={localeLabels[item].english}
          >
            {compact ? localeLabels[item].short : localeLabels[item].native}
          </Button>
        );
      })}
    </div>
  );
}
