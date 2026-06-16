-- Disable user triggers to bypass validation rules
ALTER TABLE public.bookings DISABLE TRIGGER USER;

-- Reset booking
UPDATE public.bookings
SET status = 'work_completed_pending_otp',
    commission_deducted = FALSE,
    payment_status = 'pending',
    updated_at = NOW()
WHERE id = '743d4159-8988-44ca-8d52-ffdda99890ba';

-- Delete any existing completion OTPs for this booking to have a clean slate
DELETE FROM public.booking_completion_otps WHERE booking_id = '743d4159-8988-44ca-8d52-ffdda99890ba';

-- Clean active bookings table
DELETE FROM public.active_bookings WHERE booking_id = '743d4159-8988-44ca-8d52-ffdda99890ba';

-- Insert into active bookings to simulate active state
INSERT INTO public.active_bookings (booking_id, worker_id, client_id, status)
VALUES ('743d4159-8988-44ca-8d52-ffdda99890ba', '31a8d01f-cfef-4d89-8934-bdc12186d0f1', 'e89c190c-4319-43a5-a234-10f24279375a', 'work_completed_pending_otp');

-- Restore worker availability to busy
UPDATE public.worker_availability
SET status = 'busy',
    current_booking_id = '743d4159-8988-44ca-8d52-ffdda99890ba',
    last_active_at = NOW()
WHERE worker_id = '31a8d01f-cfef-4d89-8934-bdc12186d0f1';

-- Re-enable user triggers
ALTER TABLE public.bookings ENABLE TRIGGER USER;
