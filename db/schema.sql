-- Production-ready schema for DhanDiary
-- Replaces previous schema: uses timestamptz for timestamps and canonical types

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 2. USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    clerk_id text UNIQUE,
    email text UNIQUE NOT NULL,
    name text,
    status text DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    server_version bigint NOT NULL DEFAULT 0
);

-- =====================================================
-- 3. TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS transactions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Offline-First Sync Fields
    client_id uuid,
    server_version bigint NOT NULL DEFAULT 0,

    -- Core Data
    type text NOT NULL CHECK (type IN ('income','expense')),
    amount numeric(18,2) NOT NULL CHECK (amount >= 0),
    category text,
    note text,
    currency text NOT NULL DEFAULT 'INR',
    date timestamptz NOT NULL,

    -- Sync Status Flags
    sync_status integer NOT NULL DEFAULT 0,
    need_sync boolean NOT NULL DEFAULT false,

    -- Timestamps & Soft Delete
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_sync ON transactions(user_id, server_version);
CREATE INDEX IF NOT EXISTS idx_transactions_client_id ON transactions(client_id);

-- =====================================================
-- 4. SUMMARIES TABLES (Daily & Monthly)
-- =====================================================
CREATE TABLE IF NOT EXISTS daily_summaries (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date date NOT NULL,
    total_in numeric(18,2) NOT NULL DEFAULT 0,
    total_out numeric(18,2) NOT NULL DEFAULT 0,
    count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS monthly_summaries (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year integer NOT NULL,
    month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
    total_in numeric(18,2) NOT NULL DEFAULT 0,
    total_out numeric(18,2) NOT NULL DEFAULT 0,
    count integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, year, month)
);

-- =====================================================
-- 5. HELPER FUNCTIONS (Timestamps & Versioning)
-- =====================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD IS DISTINCT FROM NEW THEN
        NEW.server_version = COALESCE(OLD.server_version, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. SUMMARY CALCULATION FUNCTIONS
-- =====================================================

-- Ensure we can replace the monthly upsert function (drop if signature differs)
DROP FUNCTION IF EXISTS upsert_monthly_summary(uuid, date);
CREATE OR REPLACE FUNCTION upsert_monthly_summary(p_user_id uuid, p_date date)
RETURNS void AS $$
BEGIN
    INSERT INTO monthly_summaries (user_id, year, month, total_in, total_out, count, updated_at)
    SELECT
        user_id,
        EXTRACT(YEAR FROM date)::int,
        EXTRACT(MONTH FROM date)::int,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0),
        COUNT(*),
        now()
    FROM transactions
    WHERE user_id = p_user_id
      AND deleted_at IS NULL
      AND date >= date_trunc('month', p_date)
      AND date <  date_trunc('month', p_date) + interval '1 month'
    GROUP BY user_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
    ON CONFLICT (user_id, year, month)
    DO UPDATE SET
        total_in = EXCLUDED.total_in,
        total_out = EXCLUDED.total_out,
        count = EXCLUDED.count,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tr_update_summaries()
RETURNS trigger AS $$
DECLARE
    d_old date;
    d_new date;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.deleted_at IS NULL THEN
        d_old := OLD.date::date;
        UPDATE daily_summaries
        SET
            total_in  = GREATEST(0, total_in  - CASE WHEN OLD.type='income'  THEN OLD.amount ELSE 0 END),
            total_out = GREATEST(0, total_out - CASE WHEN OLD.type='expense' THEN OLD.amount ELSE 0 END),
            count     = GREATEST(0, count - 1),
            updated_at = now()
        WHERE user_id = OLD.user_id AND date = d_old;

        PERFORM upsert_monthly_summary(OLD.user_id, d_old);
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.deleted_at IS NULL THEN
        d_new := NEW.date::date;
        INSERT INTO daily_summaries (user_id, date, total_in, total_out, count)
        VALUES (
            NEW.user_id,
            d_new,
            CASE WHEN NEW.type='income'  THEN NEW.amount ELSE 0 END,
            CASE WHEN NEW.type='expense' THEN NEW.amount ELSE 0 END,
            1
        )
        ON CONFLICT (user_id, date)
        DO UPDATE SET
            total_in  = daily_summaries.total_in  + EXCLUDED.total_in,
            total_out = daily_summaries.total_out + EXCLUDED.total_out,
            count     = daily_summaries.count + 1,
            updated_at = now();

        IF TG_OP = 'INSERT' OR (OLD.date::date) IS DISTINCT FROM d_new THEN
            PERFORM upsert_monthly_summary(NEW.user_id, d_new);
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. ATTACH TRIGGERS
-- =====================================================

CREATE TRIGGER tr_users_timestamp BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER tr_transactions_timestamp BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER tr_transactions_version BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION increment_version();

DROP TRIGGER IF EXISTS tr_summary_on_transactions ON transactions;
CREATE TRIGGER tr_summary_on_transactions
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION tr_update_summaries();

COMMIT;

-- NOTES:
-- Run this whole file in a single transaction in Neon. If you need to backfill summaries
-- run an idempotent aggregation from `transactions` into `daily_summaries` and `monthly_summaries`.

-- Backfill monthly summaries (optional)
-- BEGIN;
-- INSERT INTO monthly_summaries (user_id, year, month, total_in, total_out, count, updated_at)
-- SELECT user_id,
--   EXTRACT(YEAR FROM date)::INT,
--   EXTRACT(MONTH FROM date)::INT,
--   COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END),0)::numeric(18,2),
--   COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END),0)::numeric(18,2),
--   COUNT(*)::int,
--   NOW()
-- FROM cash_entries
-- WHERE NOT deleted
-- GROUP BY user_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
-- ON CONFLICT (user_id, year, month) DO UPDATE
--   SET total_in = EXCLUDED.total_in,
--       total_out = EXCLUDED.total_out,
--       count = EXCLUDED.count,
--       updated_at = NOW();
-- COMMIT;
-- Backfill monthly summaries (optional)
-- BEGIN;
-- INSERT INTO monthly_summaries (user_id, year, month, total_in, total_out, count, updated_at)
-- SELECT user_id,
--   EXTRACT(YEAR FROM date)::INT,
--   EXTRACT(MONTH FROM date)::INT,
--   COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END),0)::numeric(18,2),
--   COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END),0)::numeric(18,2),
--   COUNT(*)::int,
--   NOW()
-- FROM transactions
-- WHERE deleted_at IS NULL
-- GROUP BY user_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
-- ON CONFLICT (user_id, year, month) DO UPDATE
--   SET total_in = EXCLUDED.total_in,
--       total_out = EXCLUDED.total_out,
--       count = EXCLUDED.count,
--       updated_at = NOW();
-- COMMIT;

-- =====================================================================
-- 9. NOTES & RECOMMENDATIONS
-- =====================================================================
-- 1) Deploy this schema file using the Neon SQL editor as a transaction (copy-paste the full file).
-- 2) Run the backfill block (the commented INSERT ... SELECT) once to populate historical summaries.
-- 3) The trigger keeps `daily_summaries` and `monthly_summaries` up-to-date moving forward.
-- 4) Timezones: this schema uses `date::date` based on the DB timezone; ensure your app and DB agree on timezone semantics.
-- 5) If you expect extremely high write volume to the same user's day, consider using advisory locks or periodic background aggregation to avoid contention.
