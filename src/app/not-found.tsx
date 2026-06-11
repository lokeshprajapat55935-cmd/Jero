"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';
import { useI18n } from '@/providers/I18nProvider';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 rounded-full bg-secondary p-4 text-muted-foreground">
        <FileQuestion size={48} />
      </div>
      <h2 className="mb-2 text-2xl font-bold">{t("errors.pageNotFound")}</h2>
      <p className="mb-8 text-muted-foreground">
        {t("errors.pageNotFoundHint")}
      </p>
      <Link href="/">
        <Button>{t("common.returnHome")}</Button>
      </Link>
    </div>
  );
}
