-- Migration to enable Supabase Realtime for Admin Operations Center

DO $$
BEGIN
    -- Only enable replica identity full where necessary to capture previous values
    
    -- 1. Profiles (for worker applications)
    ALTER TABLE public.profiles REPLICA IDENTITY FULL;

    -- 2. Worker Wallets (for financial monitoring)
    ALTER TABLE public.worker_wallets REPLICA IDENTITY FULL;

    -- 3. Payout Logs (for withdrawals monitoring)
    ALTER TABLE public.payout_logs REPLICA IDENTITY FULL;

    -- Add tables to the supabase_realtime publication
    -- Note: 'bookings' and 'notifications' are already in the publication
    
    -- Ensure publication exists (it's built-in on Supabase, but good practice)
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Add tables safely
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_wallets;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_logs;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_requests;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

END $$;
