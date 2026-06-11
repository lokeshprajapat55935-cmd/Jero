-- Migration: 20260611_standardize_profile_role_to_text.sql
-- Standardizes public.profiles.role to use TEXT instead of ENUM user_role to prevent type mismatch errors.
-- Uses a dynamic PL/pgSQL block to drop and recreate dependent policies and prevent PG 0A000 errors.

DO $do$
DECLARE
    p RECORD;
    drop_sql TEXT;
    create_sql TEXT;
    roles_str TEXT;
    cleaned_qual TEXT;
    cleaned_with_check TEXT;
BEGIN
    -- 1. Create a temp table to backup all public schema policies that reference public.profiles or role
    CREATE TEMP TABLE temp_policies_backup ON COMMIT DROP AS
    SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
          tablename = 'profiles'
          OR (qual LIKE '%profiles%' OR qual LIKE '%role%')
          OR (with_check LIKE '%profiles%' OR with_check LIKE '%role%')
      );

    -- 2. Drop the dependent policies
    FOR p IN SELECT * FROM temp_policies_backup LOOP
        drop_sql := format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
        RAISE NOTICE 'Dropping policy: %', drop_sql;
        EXECUTE drop_sql;
    END LOOP;

    -- 3. Drop existing trigger that depends on profiles.role
    DROP TRIGGER IF EXISTS tr_protect_profile_roles ON public.profiles;

    -- 4. Drop default from role column
    ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

    -- 5. Convert profiles.role from user_role enum to TEXT
    ALTER TABLE public.profiles ALTER COLUMN role TYPE text USING role::text;

    -- 6. Set new default value as 'client' (text)
    ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'client';

    -- 7. Add check constraint to restrict role to allowed values
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_profiles_role;
    ALTER TABLE public.profiles ADD CONSTRAINT check_profiles_role CHECK (role IN ('client', 'worker', 'admin'));

    -- 8. Update protect_profile_roles trigger function to use text comparison and remove enum casting
    CREATE OR REPLACE FUNCTION public.protect_profile_roles() 
    RETURNS TRIGGER AS $func$
    BEGIN
      -- Standard users (authenticated role) can NEVER set their role to 'admin'
      IF auth.role() = 'authenticated' AND NEW.role = 'admin' AND (
        OLD.role IS DISTINCT FROM NEW.role OR OLD.role IS NULL
      ) THEN
        RAISE EXCEPTION 'You are not authorized to assign the admin role.';
      END IF;

      -- Once onboarding is completed (OLD.onboarded is true), standard users (authenticated)
      -- cannot change their role or set onboarded back to false.
      IF auth.role() = 'authenticated' AND OLD.onboarded = TRUE AND (
        NEW.role IS DISTINCT FROM OLD.role OR
        NEW.onboarded = FALSE
      ) THEN
        RAISE EXCEPTION 'You are not authorized to modify your profile role or revert your onboarding status after completion.';
      END IF;

      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql SECURITY DEFINER;

    -- 9. Re-create the trigger on public.profiles
    CREATE TRIGGER tr_protect_profile_roles
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.protect_profile_roles();

    -- 10. Re-create all policies, converting any enum type-casts to text
    FOR p IN SELECT * FROM temp_policies_backup LOOP
        roles_str := array_to_string(p.roles, ', ');
        IF roles_str = '' OR roles_str IS NULL THEN
            roles_str := 'public';
        END IF;

        -- Clean up policy expression definitions to remove references to the custom enum type
        cleaned_qual := p.qual;
        IF cleaned_qual IS NOT NULL THEN
            cleaned_qual := replace(cleaned_qual, '::user_role', '::text');
            cleaned_qual := replace(cleaned_qual, '::public.user_role', '::text');
        END IF;

        cleaned_with_check := p.with_check;
        IF cleaned_with_check IS NOT NULL THEN
            cleaned_with_check := replace(cleaned_with_check, '::user_role', '::text');
            cleaned_with_check := replace(cleaned_with_check, '::public.user_role', '::text');
        END IF;

        create_sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s', 
                             p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, roles_str);
                             
        IF cleaned_qual IS NOT NULL THEN
            create_sql := create_sql || ' USING (' || cleaned_qual || ')';
        END IF;
        
        IF cleaned_with_check IS NOT NULL THEN
            create_sql := create_sql || ' WITH CHECK (' || cleaned_with_check || ')';
        END IF;
        
        RAISE NOTICE 'Re-creating policy: %', create_sql;
        EXECUTE create_sql;
    END LOOP;

    -- 11. Finally, drop the custom enum type if it exists, as it is no longer used by any schema objects
    DROP TYPE IF EXISTS public.user_role;
    
END $do$;
