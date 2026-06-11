export type UserRole = 'client' | 'worker' | 'admin';
export type AdminRole = 'super_admin' | 'operations_admin' | 'support_admin' | 'finance_admin';

export interface Profile {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  location_name: string | null;
  role: UserRole;
  firebase_uid?: string | null;
  admin_role?: AdminRole | null;
  phone_verified?: boolean;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  worker_id: string;
  title: string;
  description: string | null;
  price: number;
  category: string;
  created_at: string;
  updated_at: string;
}

/**
 * Typed availability object stored as JSONB in the workers table.
 * Matches the shape written and read by the worker availability dashboard.
 */
export interface WorkerAvailability {
  /** Current real-time status of the worker. */
  status?: 'online' | 'offline' | 'busy' | 'unavailable';
  /** Weekly schedule: each day key maps to [startTime, endTime] strings. */
  schedule?: Record<string, string[]>;
  instant_booking?: boolean;
  emergency_enabled?: boolean;
}

export interface Worker {
  id: string;
  name: string;
  image: string;
  profile?: Profile;
  category: string;
  bio: string | null;
  base_service_charge: number;
  visit_charge: number;
  experience_years: number;
  skills: string[];
  languages: string[];
  social_links: Record<string, string>;
  service_area: string | null;
  city_id?: string;
  area_id?: string;
  verified: boolean;
  availability: WorkerAvailability | null;
  gallery: string[];
  rating_avg: number;
  rating?: number;
  review_count: number;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'suspended';
  /** Admin-only moderation note. Set during worker review/suspension. */
  moderation_note?: string;
  services?: Service[];
}

export interface Client {
  id: string;
  profile?: Profile;
  address: string | null;
  phone: string | null;
  city_id?: string; // NEW: Reference to city
  area_id?: string; // NEW: Reference to area
}

export interface ServiceRequest {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  category: string;
  budget_min: number | null;
  budget_max: number | null;
  location_address: string | null;
  status: 'open' | 'in-progress' | 'completed' | 'cancelled';
  scheduled_at: string | null;
  created_at: string;
}

export interface SavedWorker {
  id: string;
  client_id: string;
  worker_id: string;
  worker?: Worker;
  created_at: string;
}

import type { BookingStatus, PaymentMethod, PaymentStatus } from '@/lib/booking/constants';

export interface Review {
  id: string;
  userName: string;
  userImage?: string;
  rating: number;
  comment: string;
  date: string;
}

export type { BookingStatus, PaymentMethod, PaymentStatus };

export interface BookingItem {
  id: string;
  booking_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  notes?: string;
  created_at: string;
}

export interface Booking {
  id: string;
  request_id: string | null;
  client_id: string;
  worker_id: string;
  status: BookingStatus;
  total_price: number;
  base_service_charge?: number;
  visit_charge?: number;
  scheduled_at: string;
  created_at: string;
  updated_at: string;
  city_id?: string;
  category?: string;
  description?: string | null;
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  payment_locked?: boolean;
  payment_reference?: string;
  location_address?: string;
  latitude?: number | null;
  longitude?: number | null;
  area_id?: string | null;
  expires_at?: string;
  notified_worker_count?: number;
  otp_code?: string;
  otp_expires_at?: string;
  otp_attempts?: number;
  booking_type?: 'asap' | 'scheduled';
  scheduled_for?: string | null;
  scheduled_date?: string | null;
  scheduled_time_slot?: 'asap' | 'morning' | 'afternoon' | 'evening' | 'custom' | null;
  image_urls?: string[];
  job_notes?: string;
  // Commission & Payment fields
  service_charge?: number;
  material_charge?: number;
  discount_amount?: number;
  commission_rate?: number;
  commission_amount?: number;
  commission_deducted?: boolean;
  // Commission preview (returned by verify-otp)
  commission_preview?: number;
  worker?: Worker & { profile?: Profile };
  client?: Client & { profile?: Profile };
  timeline?: BookingTimeline[];
  workerId?: string;
  workerName?: string;
  date?: string;
  time?: string;
  price?: number;
  location?: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface BookingTimeline {
  id: string;
  booking_id: string;
  status: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export type DisputeType = 'client_complaint' | 'worker_complaint' | 'payment_issue' | 'fraud_report' | 'otp_issue' | 'quality_issue' | 'other';
export type DisputeStatus = 'open' | 'under_review' | 'resolved_client' | 'resolved_worker' | 'escalated' | 'closed';
export type DisputePriority = 'low' | 'medium' | 'high' | 'critical';

export interface Dispute {
  id: string;
  booking_id: string;
  raised_by: string;
  raised_against: string | null;
  dispute_type: DisputeType;
  status: DisputeStatus;
  title: string;
  description: string;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  priority: DisputePriority;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  booking?: Booking;
  raiser?: Profile;
  against?: Profile;
  resolver?: Profile;
}

export interface AdminLog {
  id: string;
  admin_id: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  old_value: Record<string, any> | null;
  new_value: Record<string, any> | null;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
  admin?: Profile;
}

export type FraudFlagType = 'suspicious_cancellation' | 'fake_booking' | 'wallet_abuse' | 'otp_failure_pattern' | 'repeated_disputes' | 'account_sharing' | 'other';
export type FraudFlagSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FraudFlagStatus = 'open' | 'dismissed' | 'escalated' | 'actioned';

export interface FraudFlag {
  id: string;
  user_id: string;
  flag_type: FraudFlagType;
  severity: FraudFlagSeverity;
  status: FraudFlagStatus;
  description: string;
  booking_id: string | null;
  evidence: Record<string, any>;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  user?: Profile;
  reviewer?: Profile;
  booking?: Booking;
}

export interface AdminNotification {
  id: string;
  sent_by: string;
  target_type: 'all_workers' | 'all_clients' | 'all_users' | 'city' | 'specific_user';
  target_city_id: string | null;
  target_user_id: string | null;
  title: string;
  message: string;
  notification_type: 'info' | 'warning' | 'announcement' | 'urgent';
  sent_count: number;
  created_at: string;
  sender?: Profile;
}

export interface PayoutLog {
  id: string;
  worker_id: string;
  amount: number;
  payment_method: 'bank_transfer' | 'upi' | 'wallet_credit';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  reference_id: string | null;
  notes: string | null;
  initiated_by: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  worker?: Profile;
}

export interface LiveSnapshot {
  active_bookings: number;
  online_workers: number;
  open_disputes: number;
  failed_payments_24h: number;
  today_revenue: number;
  today_bookings: number;
}

export interface PlatformConfig {
  key: string;
  value: string;
  description: string | null;
}

export interface WorkerLocation {
  worker_id: string;
  latitude: number | null;
  longitude: number | null;
  city_id: string | null;
  area_id: string | null;
  last_active_at: string;
}

export type WorkerAvailabilityStatus = 'offline' | 'online' | 'busy' | 'unavailable';

export interface WorkerAvailabilityDb {
  worker_id: string;
  status: WorkerAvailabilityStatus;
  last_active_at: string;
  current_booking_id: string | null;
}

export interface DispatchRequest {
  id: string;
  booking_id: string;
  status: 'searching' | 'accepted' | 'expired' | 'cancelled';
  max_radius_km: number;
  current_radius_km: number;
  created_at: string;
  updated_at: string;
}

export interface DispatchAttempt {
  id: string;
  dispatch_request_id: string;
  worker_id: string;
  status: 'sent' | 'accepted' | 'rejected' | 'expired';
  created_at: string;
}

export interface ActiveBooking {
  booking_id: string;
  worker_id: string;
  client_id: string;
  status: string;
  created_at: string;
}

export type ReviewerRole = 'client' | 'worker';

export interface Review {
  id: string;
  booking_id: string;
  worker_id: string;
  customer_id: string;
  reviewer_role: ReviewerRole;
  rating: number;
  review_text: string | null;
  tags: string[] | null;
  rating_behavior?: number | null;
  rating_cooperation?: number | null;
  rating_payment?: number | null;
  is_hidden: boolean;
  is_flagged: boolean;
  created_at: string;
  
  // Optional relations
  reviewer?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  client?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    profile?: {
      full_name: string | null;
      avatar_url: string | null;
    };
  };
  worker?: {
    id?: string;
    category?: string;
    name?: string;
    profile?: {
      id?: string;
      full_name: string | null;
      avatar_url: string | null;
      email?: string | null;
      phone?: string | null;
    };
  };
}
