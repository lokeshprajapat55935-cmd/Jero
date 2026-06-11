import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthLoadingProps = {
  label?: string;
  className?: string;
};

export function AuthLoading({ label = 'Loading...', className }: AuthLoadingProps) {
  return (
    <div
      className={cn(
        'flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-semibold">{label}</p>
    </div>
  );
}