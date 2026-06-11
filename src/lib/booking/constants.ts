import type { Booking } from '@/types';

export const PAYMENT_METHODS = ['cash', 'upi', 'card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'processing', 'paid', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BOOKING_STATUSES = [
  'scheduled',        // Created but not yet dispatched (future booking)
  'pending',
  'broadcasting',
  'accepted',
  'worker_arriving',
  'en_route',
  'arrived',
  'work_started',
  'started',
  'in_progress',       // Legacy/Alias for work_started
  'work_completed',
  'work_completed_pending_otp',
  'awaiting_otp',      // Legacy/Alias for work_completed_pending_otp
  'awaiting_item_approval',
  'item_approved',
  'otp_generated',
  'otp_verified',
  'awaiting_payment',
  'payment_processing',
  'payment_verified',
  'completed',
  'paid_completed',    // Legacy/Alias for completed
  'cancelled',
  'disputed',
  'no_worker_available', // All dispatch attempts exhausted
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_TYPES = ['asap', 'scheduled'] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

const TRANSITIONS: Record<string, BookingStatus[]> = {
  scheduled: ['broadcasting', 'cancelled'],
  pending: ['broadcasting', 'cancelled', 'accepted'],
  broadcasting: ['accepted', 'cancelled', 'no_worker_available'],
  accepted: ['worker_arriving', 'en_route', 'arrived', 'cancelled'],
  worker_arriving: ['arrived', 'work_started', 'started', 'cancelled'],
  en_route: ['arrived', 'started', 'cancelled'],
  arrived: ['work_started', 'started', 'cancelled'],
  work_started: ['work_completed', 'work_completed_pending_otp', 'cancelled', 'disputed'],
  started: ['work_completed', 'work_completed_pending_otp', 'cancelled', 'disputed'],
  work_completed: ['awaiting_item_approval', 'completed'],
  work_completed_pending_otp: ['completed', 'disputed'],
  awaiting_item_approval: ['item_approved', 'disputed', 'cancelled'],
  item_approved: ['otp_generated', 'disputed', 'cancelled'],
  otp_generated: ['otp_verified', 'disputed'],
  otp_verified: ['awaiting_payment', 'disputed', 'completed'],
  awaiting_payment: ['payment_processing', 'completed', 'disputed'],
  payment_processing: ['payment_verified', 'completed', 'awaiting_payment', 'disputed'],
  payment_verified: ['completed'],
  completed: [],
  cancelled: [],
  no_worker_available: ['broadcasting', 'cancelled'],
  disputed: ['completed', 'cancelled'],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return ['completed', 'cancelled', 'no_worker_available'].includes(status);
}

export function isActiveStatus(status: BookingStatus): boolean {
  return ['accepted', 'worker_arriving', 'en_route', 'arrived', 'work_started', 'started', 'work_completed', 'work_completed_pending_otp', 'awaiting_item_approval', 'item_approved'].includes(status);
}

export function isDispatchingStatus(status: BookingStatus): boolean {
  return ['pending', 'broadcasting', 'scheduled'].includes(status);
}

export function assertCashPaymentOnly(method: string): boolean {
  return method === 'cash';
}

// Human-readable status labels
export const STATUS_LABELS: Record<BookingStatus, string> = {
  scheduled: 'Scheduled',
  pending: 'Pending',
  broadcasting: 'Finding Workers',
  accepted: 'Worker Assigned',
  worker_arriving: 'Worker On The Way',
  en_route: 'Worker En Route',
  arrived: 'Worker Arrived',
  work_started: 'Work In Progress',
  started: 'Work Started',
  in_progress: 'In Progress',
  work_completed: 'Work Done',
  work_completed_pending_otp: 'Awaiting Verification',
  awaiting_otp: 'Awaiting OTP',
  awaiting_item_approval: 'Awaiting Item Approval',
  item_approved: 'Items Approved',
  otp_generated: 'OTP Generated',
  otp_verified: 'OTP Verified',
  awaiting_payment: 'Awaiting Payment',
  payment_processing: 'Payment Processing',
  payment_verified: 'Payment Verified',
  completed: 'Completed',
  paid_completed: 'Paid & Completed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
  no_worker_available: 'No Workers Available',
};

export const DISPATCH_RESPONSE_WINDOW_SECONDS = 45; // Default, overridden by platform_config
export const DISPATCH_MAX_ATTEMPTS = 10;