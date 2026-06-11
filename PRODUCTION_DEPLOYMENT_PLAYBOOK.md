# Zolvo Platform - Production Deployment Playbook & Launch Readiness Guide

This playbook contains environment setups, migration orders, verification checks, rollback protocols, and launch checklists to guide the deployment of the **Zolvo** platform to production.

---

## 📂 1. ENVIRONMENT SETUP GUIDE

Ensure the following credentials are configured in your production hosting dashboards. Do **NOT** use local development defaults.

### A. Next.js / Frontend Hosting (e.g., Vercel)
Set these variables inside your hosting platform's environment settings:

| Variable Name | Production Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production bundler optimizations and locks dev APIs. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://[prod-project-id].supabase.co` | Your production Supabase project API endpoint. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `[prod-anon-key]` | Public anonymous key for client authentication. |
| `SUPABASE_SERVICE_ROLE_KEY` | `[prod-service-role-key]` | **SECRET**: Server-only elevated API access. Keep private. |
| `NEXT_PUBLIC_SITE_URL` | `https://zolvo.in` | Main application canonical canonical domain. |
| `NEXT_PUBLIC_OTP_PROVIDER` | `supabase` | Enforces production native SMS verification gateways. |

> [!WARNING]
> Ensure `NEXT_PUBLIC_OTP_PROVIDER` is strictly configured to `supabase`. Staging/Development defaults (`mock`) are automatically rejected in production mode to block auth bypass.

### B. Supabase Dashboard Configuration
Navigate to **Settings > Provider > Phone** on the Supabase project dashboard:
1. **Enable Phone Provider**: Turn ON Phone Auth.
2. **SMS Gateway Credentials**: Connect your SMS gateway (e.g. Twilio, MessageBird) with your verified Sender ID, Auth Token, and SID credentials.
3. **OTP SMS Template**: Configure OTP message body (e.g. `Your Zolvo verification code is {{ .Code }}`).
4. **Rate Limits**: Limit sign-in requests (e.g., maximum 5 requests per 10 minutes per IP/Phone) to prevent SMS billing abuse.

---

## 🚀 2. PRODUCTION DEPLOYMENT CHECKLIST

Follow these steps sequentially during the production release window:

### Step 1: Database Setup & Schema Migrations
Deploy the verified database schemas using the Supabase SQL editor:
1. Run the core schema setup scripts located in `supabase/migrations/` in chronological order.
2. **CRITICAL**: Execute the database optimization and trigger script [20260602_fix_worker_status_mismatch.sql](file:///c:/Users/lokeshkumar/my-app/zolvo-app/supabase/migrations/20260602_fix_worker_status_mismatch.sql) last to configure the approved status matching, GPS fraud triggers, and RLS policies.
3. Verify that the active city is populated in the database config by running:
   ```sql
   INSERT INTO public.platform_config (key, value)
   VALUES ('active_city_slug', 'bhilwara')
   ON CONFLICT (key) DO UPDATE SET value = 'bhilwara';
   ```

### Step 2: Build & Asset Compilation
Ensure the Next.js production build completes with zero errors:
```bash
# Build verification command
npm run build
```
Check that static route outputs are split, with administrative dashboards (such as `/admin/workers`, `/admin/bookings`) loading dynamically and outputting a bundle size of approximately **105 kB** or less.

### Step 3: API & Client Checks
1. Load `/auth/login` to confirm that typing a phone number requests a real SMS code.
2. Log in as an admin to check the Analytics, Wallet, and Moderation dashboard loads.
3. Run the automated wallet audit ledger script:
   ```bash
   node scratch/wallet_reconciliation.js
   ```
   Ensure no variances are found between the worker table totals and transaction ledger logs.

---

## 🔄 3. EMERGENCY ROLLBACK PLAYBOOK

If critical issues or regressions occur during launch, execute these steps immediately to restore service:

### A. Code Rollback
To revert the frontend changes to a previous stable state:
1. Revert to the last stable deployment commit on your branch:
   ```bash
   git revert [commit-hash]
   git push origin main
   ```
2. In Vercel, navigate to the **Deployments** tab and select **Rollback** on the previous successful build.

### B. Database Schema Rollback
If a database migration causes errors:
1. Execute specific script rollbacks. For example, to revert the RLS policies and functions implemented in `20260602_fix_worker_status_mismatch.sql`:
   ```sql
   -- Revert RLS policy alignments
   DROP POLICY IF EXISTS "Workers can view assigned or broadcasting bookings" ON public.bookings;
   DROP POLICY IF EXISTS "Participants and eligible workers can update bookings" ON public.bookings;
   
   -- Restore standard client query policies if needed, or restore previous definitions.
   ```
2. Retain all user transactions and profiles tables intact. Do **NOT** run `DROP TABLE` commands on live customer data under any circumstances.

---

## 🧪 4. BETA TESTING SCHEMAS (LAUNCH READY)

Complete these test scenarios using real beta devices prior to open public registration:

### Scenario A: Worker Self-Onboarding
1. Sign up a new worker via `/auth/signup` using a real mobile phone.
2. Complete onboarding up to the **Service Area Grid** selection.
3. Select an area in Bhilwara, then submit.
4. **Admin Approval**: Log in as an admin, navigate to **Worker Moderation**, locate the new worker, and click **Approve** (transitions worker status to `approved`).
5. Verify the worker can now toggles availability status to `'available'`.

### Scenario B: Booking Dispatch & OTP Verification
1. Log in as a client and request a service matching the worker's category.
2. Verify that the worker receives a **New Service Request Nearby** notification.
3. Accept the booking from the worker dashboard (locks active booking state).
4. Simulate worker arriving and starting work.
5. Worker clicks "Declare Complete" (generates OTP code, updates status to `awaiting_otp`).
6. Client shares the OTP code shown in their **Activity View**.
7. Worker inputs the OTP to confirm work completion (status transitions to `awaiting_payment`).

### Scenario C: Payout & Commission Deduction
1. Client selects payment method:
   - **Cash**: Worker wallet is charged commission (e.g. 10%) automatically via database trigger.
   - **Online**: Client makes mock online checkout using a reference like `UPI-TXN-1234567890`.
2. Confirm payment success:
   - Cash booking transitions to `completed`.
   - Online booking transitions to `paid_completed` and credits worker wallet balance (0% commission).
3. Run the reconciliation script to confirm ledger totals are aligned perfectly.

---

## 📊 5. OPERATIONAL MONITORING & ANALYTICS

Keep the platform healthy post-launch using these monitoring routines:

- **Log Analysis**: Check structured server logs (Datadog or Vercel log stream) for JSON payloads matching `[API Error]` or `[ERROR]`.
- **Fraud Log Tracking**: Monitor the `public.fraud_flags` table for warnings regarding GPS distance bypasses or repeated payment failures.
- **Analytics KPIs**: Track booking volumes, category distributions, and worker dispatch times using the Admin panel dashboard `/admin/analytics`.
