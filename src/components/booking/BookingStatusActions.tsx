'use client';

import { Button } from '@/components/ui/button';
import { Booking } from '@/types';
import { canTransition } from '@/lib/booking/constants';

type BookingStatusActionsProps = {
  booking: Booking;
  role: 'client' | 'worker';
  onUpdate: (status: Booking['status'], reason?: string) => Promise<void>;
  loading?: boolean;
};

export function BookingStatusActions({
  booking,
  role,
  onUpdate,
  loading,
}: BookingStatusActionsProps) {
  const status = booking.status as any;

  const actions: { label: string; next: Booking['status']; variant?: 'default' | 'outline' | 'destructive' }[] = [];

  if (role === 'worker') {
    if (canTransition(status, 'accepted' as any)) actions.push({ label: 'Accept', next: 'accepted' });
    if (canTransition(status, 'worker_arriving' as any)) actions.push({ label: 'Mark Arriving', next: 'worker_arriving' });
    if (canTransition(status, 'work_started' as any)) actions.push({ label: 'Start job', next: 'work_started' });
    if (canTransition(status, 'work_completed' as any)) actions.push({ label: 'Mark Work Completed', next: 'work_completed' });
    if (canTransition(status, 'work_completed_pending_otp' as any)) actions.push({ label: 'Request OTP', next: 'work_completed_pending_otp' });
  }

  if (role === 'client') {
    if (canTransition(status, 'cancelled' as any)) {
      actions.push({ label: 'Cancel request', next: 'cancelled', variant: 'destructive' });
    }
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action.next}
          size="sm"
          variant={action.variant ?? 'default'}
          disabled={loading}
          isLoading={loading}
          onClick={() => onUpdate(action.next, `${action.label} by ${role}`)}
          className="rounded-xl text-xs font-bold"
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}