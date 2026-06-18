-- Migration to add brute-force protection to admin_secrets

ALTER TABLE public.admin_secrets 
ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Function to increment failed attempts and optionally lock
CREATE OR REPLACE FUNCTION increment_admin_failed_attempts(p_admin_id UUID)
RETURNS void AS $$
DECLARE
    current_attempts INT;
BEGIN
    -- Increment
    UPDATE public.admin_secrets
    SET failed_attempts = failed_attempts + 1
    WHERE admin_id = p_admin_id
    RETURNING failed_attempts INTO current_attempts;

    -- Lock if threshold reached (5 attempts)
    IF current_attempts >= 5 THEN
        UPDATE public.admin_secrets
        SET locked_until = NOW() + INTERVAL '15 minutes'
        WHERE admin_id = p_admin_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset failed attempts upon successful login
CREATE OR REPLACE FUNCTION reset_admin_failed_attempts(p_admin_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.admin_secrets
    SET failed_attempts = 0, locked_until = NULL
    WHERE admin_id = p_admin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
