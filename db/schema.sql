/*
  DhanDiary - Improved Database Schema for NeonDB (PostgreSQL)
  
  Run this script in your Neon SQL Editor to initialize or reset your database.
  WARNING: This will define the structure for a fresh database.
*/

-- Enable UUID extension for unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE OR REPLACE FUNCTION upsert_monthly_summary(p_user_id UUID, p_month_date DATE)
RETURNS VOID AS $$
BEGIN
    INSERT INTO monthly_summaries (user_id, year, month, total_in, total_out, count, updated_at)
    SELECT user_id,
                 EXTRACT(YEAR FROM date)::INT AS yr,
                 EXTRACT(MONTH FROM date)::INT AS mn,
                 COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::numeric(18,2) AS total_in,
                 COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)::numeric(18,2) AS total_out,
                 COUNT(*)::INT AS cnt,
                 NOW()
    FROM transactions
    WHERE user_id = p_user_id
        AND date >= p_month_date
        AND date < (p_month_date + INTERVAL '1 month')
        AND deleted_at IS NULL
    GROUP BY user_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
    ON CONFLICT (user_id, year, month) DO UPDATE
        SET total_in = EXCLUDED.total_in,
                total_out = EXCLUDED.total_out,
                count = EXCLUDED.count,
                updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger function: maintain daily_summaries and keep monthly in sync
CREATE OR REPLACE FUNCTION tr_upsert_daily_summary()
RETURNS TRIGGER AS $$
DECLARE
    v_old_date DATE;
    v_new_date DATE;
BEGIN
    -- INSERT
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.deleted_at IS NOT NULL) THEN
            RETURN NEW;
        END IF;
        v_new_date := NEW.date::date;
        IF (NEW.type = 'income') THEN
            INSERT INTO daily_summaries(user_id, date, total_in, total_out, count, updated_at)
            VALUES (NEW.user_id, v_new_date, NEW.amount::numeric, 0, 1, NOW())
            ON CONFLICT (user_id, date) DO UPDATE
                SET total_in = daily_summaries.total_in + EXCLUDED.total_in,
                        count = daily_summaries.count + 1,
                        updated_at = NOW();
        ELSE
            INSERT INTO daily_summaries(user_id, date, total_in, total_out, count, updated_at)
            VALUES (NEW.user_id, v_new_date, 0, NEW.amount::numeric, 1, NOW())
            ON CONFLICT (user_id, date) DO UPDATE
                SET total_out = daily_summaries.total_out + EXCLUDED.total_out,
                        count = daily_summaries.count + 1,
                        updated_at = NOW();
        END IF;

        -- maintain monthly aggregate for the new row's month
        PERFORM upsert_monthly_summary(NEW.user_id, date_trunc('month', NEW.date)::date);
        RETURN NEW;
    END IF;

    -- UPDATE
    IF (TG_OP = 'UPDATE') THEN
        v_old_date := OLD.date::date;
        v_new_date := NEW.date::date;

        -- If row transitioned from not-deleted -> deleted: subtract OLD
        IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
            IF (OLD.type = 'income') THEN
                UPDATE daily_summaries
                SET total_in = GREATEST(total_in - OLD.amount, 0), count = GREATEST(count - 1, 0), updated_at = NOW()
                WHERE user_id = OLD.user_id AND date = v_old_date;
            ELSE
                UPDATE daily_summaries
                SET total_out = GREATEST(total_out - OLD.amount, 0), count = GREATEST(count - 1, 0), updated_at = NOW()
                WHERE user_id = OLD.user_id AND date = v_old_date;
            END IF;

            PERFORM upsert_monthly_summary(OLD.user_id, date_trunc('month', OLD.date)::date);
            RETURN NEW;
        END IF;

        -- If the OLD row existed (not deleted) subtract its contribution
        IF (OLD.deleted_at IS NULL) THEN
            IF (OLD.type = 'income') THEN
                UPDATE daily_summaries
                SET total_in = GREATEST(total_in - OLD.amount, 0), count = GREATEST(count - 1, 0), updated_at = NOW()
                WHERE user_id = OLD.user_id AND date = v_old_date;
            ELSE
                UPDATE daily_summaries
                SET total_out = GREATEST(total_out - OLD.amount, 0), count = GREATEST(count - 1, 0), updated_at = NOW()
                WHERE user_id = OLD.user_id AND date = v_old_date;
            END IF;
        END IF;

        -- If the NEW row is not deleted, add its contribution
        IF (NEW.deleted_at IS NULL) THEN
            IF (NEW.type = 'income') THEN
                INSERT INTO daily_summaries(user_id, date, total_in, total_out, count, updated_at)
                VALUES (NEW.user_id, v_new_date, NEW.amount::numeric, 0, 1, NOW())
                ON CONFLICT (user_id, date) DO UPDATE
                    SET total_in = daily_summaries.total_in + EXCLUDED.total_in,
                            count = daily_summaries.count + 1,
                            updated_at = NOW();
            ELSE
                INSERT INTO daily_summaries(user_id, date, total_in, total_out, count, updated_at)
                VALUES (NEW.user_id, v_new_date, 0, NEW.amount::numeric, 1, NOW())
                ON CONFLICT (user_id, date) DO UPDATE
                    SET total_out = daily_summaries.total_out + EXCLUDED.total_out,
                            count = daily_summaries.count + 1,
                            updated_at = NOW();
            END IF;
        END IF;

        -- Recompute monthly summaries for any affected months
        PERFORM upsert_monthly_summary(OLD.user_id, date_trunc('month', OLD.date)::date);
        PERFORM upsert_monthly_summary(NEW.user_id, date_trunc('month', NEW.date)::date);
        RETURN NEW;
    END IF;

    -- DELETE
    IF (TG_OP = 'DELETE') THEN
        IF (OLD.deleted_at IS NULL) THEN
            IF (OLD.type = 'income') THEN
                UPDATE daily_summaries
                SET total_in = GREATEST(total_in - OLD.amount, 0), count = GREATEST(count - 1, 0), updated_at = NOW()
                WHERE user_id = OLD.user_id AND date = OLD.date::date;
            ELSE
                UPDATE daily_summaries
                SET total_out = GREATEST(total_out - OLD.amount, 0), count = GREATEST(count - 1, 0), updated_at = NOW()
                WHERE user_id = OLD.user_id AND date = OLD.date::date;
            END IF;
        END IF;

        PERFORM upsert_monthly_summary(OLD.user_id, date_trunc('month', OLD.date)::date);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to transactions
DROP TRIGGER IF EXISTS tr_summary_on_transactions ON transactions;
CREATE TRIGGER tr_summary_on_transactions
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION tr_upsert_daily_summary();



-- =====================================================================
-- 8. BACKFILL / MIGRATION HELPERS
-- =====================================================================

-- Backfill daily_summaries from existing cash_entries (idempotent upsert)
-- Run this in the Neon SQL editor once during migration
--
-- BEGIN;
-- INSERT INTO daily_summaries (user_id, date, total_in, total_out, count, updated_at)
-- SELECT user_id, date::date,
--   COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END),0)::numeric(18,2),
--   COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END),0)::numeric(18,2),
--   COUNT(*)::int,
--   NOW()
-- FROM cash_entries
-- WHERE NOT deleted
-- GROUP BY user_id, date::date
-- ON CONFLICT (user_id, date) DO UPDATE
--   SET total_in = EXCLUDED.total_in,
--       total_out = EXCLUDED.total_out,
--       count = EXCLUDED.count,
--       updated_at = NOW();
-- COMMIT;
-- Backfill daily_summaries from existing transactions (idempotent upsert)
-- Run this in the Neon SQL editor once during migration
--
-- BEGIN;
-- INSERT INTO daily_summaries (user_id, date, total_in, total_out, count, updated_at)
-- SELECT user_id, date::date,
--   COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END),0)::numeric(18,2),
--   COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END),0)::numeric(18,2),
--   COUNT(*)::int,
--   NOW()
-- FROM transactions
-- WHERE deleted_at IS NULL
-- GROUP BY user_id, date::date
-- ON CONFLICT (user_id, date) DO UPDATE
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
