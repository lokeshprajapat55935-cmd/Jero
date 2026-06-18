# Jero Platform - Database Backup & Recovery Playbook

This document details the database backup schedules, automated cron scripts, and step-by-step restoration procedures for the **Jero** production PostgreSQL database hosted on Supabase.

---

## 📂 1. BACKUP STRATEGY & SCHEDULE

Jero enforces a dual-backup retention policy to ensure zero data loss under disaster recovery scenarios:

| Backup Type | Frequency | Retention Window | Storage Target | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| **Physical Backups** | Daily (Automated) | 30 Days | Supabase Managed Storage | Supabase platform (built-in) |
| **Logical Backups (`pg_dump`)**| Weekly (Full) | 90 Days | Offsite AWS S3 bucket | Operational team cron jobs |
| **Audit Logs** | Real-time | Perpetual | `public.security_logs` | Trigger-based logs |

---

## ⚙️ 2. AUTOMATING LOGICAL BACKUPS (CRON SETUPS)

Configure a weekly cron job on an operations server (or Github Actions schedule) to export and encrypt full database schema and transactional data.

### Step 1: Install PostgreSQL Client
Verify the client matches your Supabase major engine version (typically PG15 or PG16):
```bash
# Debian/Ubuntu
sudo apt-get install postgresql-client
```

### Step 2: Configure Environment Credentials
Create a `.env.backup` configuration file (store privately):
```bash
BACKUP_DB_HOST="aws-0-ap-south-1.pooler.supabase.com"
BACKUP_DB_PORT="6543"
BACKUP_DB_NAME="postgres"
BACKUP_DB_USER="postgres.[YOUR_PROJECT_ID]"
BACKUP_DB_PASS="[YOUR_SECURE_PASSWORD]"
BACKUP_DIR="/var/backups/jero"
```

### Step 3: Write Backup Cron Script (`backup.sh`)
```bash
#!/bin/bash
# Load environment
source .env.backup

DATE=$(date +%Y-%m-%d_%H%M%S)
FILENAME="${BACKUP_DIR}/zolvo_prod_backup_${DATE}.sql.gz"

echo "Starting logical database backup..."
export PGPASSWORD="${BACKUP_DB_PASS}"

# Execute pg_dump with custom transaction options
pg_dump -h "${BACKUP_DB_HOST}" -p "${BACKUP_DB_PORT}" -U "${BACKUP_DB_USER}" -d "${BACKUP_DB_NAME}" \
  --clean --if-exists --no-owner --no-privileges | gzip > "${FILENAME}"

if [ $? -eq 0 ]; then
  echo "Backup successfully completed: ${FILENAME}"
  # Optional: Upload to encrypted S3 bucket
  # aws s3 cp "${FILENAME}" "s3://zolvo-database-backups/prod/"
else
  echo "ERROR: Backup failed!"
  exit 1
fi
```
Configure permissions: `chmod +x backup.sh`

### Step 4: Add to Crontab
Open cron configurations: `crontab -e`
Add the following line to run the backup every Sunday at 02:00 AM:
```cron
0 2 * * 0 /bin/bash /var/backups/jero/backup.sh >> /var/log/zolvo_backup.log 2>&1
```

---

## 🔄 3. STEP-BY-STEP RESTORE PROCEDURE

In the event of a catastrophic server crash or data corruption, execute this restore procedure to reconstitute service.

> [!CAUTION]
> Rebuilding a live database overwrites existing table records. Ensure you take a manual snapshot of the current corrupt database state *prior* to beginning recovery to preserve triage logs.

### Step 1: Put Application in Maintenance Mode
To block active API requests from writing new data during restoration:
1. In Vercel, change `NEXT_PUBLIC_SITE_MAINTENANCE` environment variable to `true`.
2. Redeploy to direct all incoming traffic to a static maintenance page.

### Step 2: Extract Backup Archive
Locate the target backup file and unzip it:
```bash
gunzip zolvo_prod_backup_2026-06-03_020000.sql.gz
```

### Step 3: Execute Restoration Command
Run the SQL dump file against your Supabase endpoint:
```bash
export PGPASSWORD="[YOUR_SECURE_PASSWORD]"

psql -h "aws-0-ap-south-1.pooler.supabase.com" \
     -p "6543" \
     -U "postgres.[YOUR_PROJECT_ID]" \
     -d "postgres" \
     -f "zolvo_prod_backup_2026-06-03_020000.sql"
```

### Step 4: Post-Restoration Verification Checks
Run the following checks using your PostgreSQL editor:
1. **Count Matches:** Verify worker and customer counts align with pre-crash figures.
   ```sql
   SELECT count(*) FROM public.profiles;
   ```
2. **Verify Configuration Keys:** Check if Bhilwara is the active configuration city.
   ```sql
   SELECT value FROM public.platform_config WHERE key = 'active_city_slug';
   ```
3. **Run Wallet Audit:** Run the wallet adjustment check script.
   ```bash
   node scratch/verify_sync_counts.js
   ```

### Step 5: Deactivate Maintenance Mode
Once verified, switch `NEXT_PUBLIC_SITE_MAINTENANCE` back to `false` in Vercel and redeploy to restore operations.
