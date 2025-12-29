#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Load .env when present
try {
  const dotenv = require('dotenv');
  const root = path.resolve(__dirname, '..');
  const candidates = ['.env', '.env.local', '.env.development'];
  for (const f of candidates) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      break;
    }
  }
} catch (e) {}

let NEON_URL = process.env.NEON_URL || process.env.NEON_DATABASE_URL || null;
if (!NEON_URL) {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      if (appJson && appJson.expo && appJson.expo.extra && appJson.expo.extra.NEON_URL) {
        NEON_URL = appJson.expo.extra.NEON_URL;
      }
    }
  } catch (e) {}
}

if (!NEON_URL) {
  console.error('NEON_URL not found. Set NEON_URL or NEON_DATABASE_URL or add to app.json');
  process.exit(2);
}

const { neon } = require('@neondatabase/serverless');
const sql = neon(NEON_URL);

const run = async () => {
  try {
    await sql.query('SELECT 1');
  } catch (e) {
    console.error('Failed to connect to Neon:', e.message || e);
    process.exit(3);
  }

  console.log('Ensuring uuid-ossp extension exists...');
  try {
    await sql.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  } catch (e) {
    console.warn('Could not ensure extension (non-fatal):', e.message || e);
  }

  // Check transactions table
  const t = await sql.query("SELECT to_regclass('public.transactions') as exists;");
  const has = !!(t && t[0] && t[0].exists);
  console.log('transactions table exists:', has);

  if (!has) {
    console.log('Creating transactions table...');
    await sql.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id uuid NOT NULL,
        client_id uuid,
        type text,
        amount numeric(18,2),
        category text,
        note text,
        currency text DEFAULT 'INR',
        created_at bigint,
        updated_at bigint,
        deleted_at bigint,
        date timestamptz,
        server_version bigint DEFAULT 0
      );
    `);
    console.log('Created transactions table.');
  } else {
    console.log(
      'Ensuring required columns exist (id, user_id, client_id, type, amount, category, note, currency, created_at, updated_at, deleted_at, date, server_version)...'
    );
    const alters = [];
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_id uuid;');
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type text;');
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount numeric(18,2);');
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category text;');
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note text;');
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR';");
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at bigint;');
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at bigint;');
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at bigint;');
    alters.push('ALTER TABLE transactions ADD COLUMN IF NOT EXISTS date timestamptz;');
    alters.push(
      'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS server_version bigint DEFAULT 0;'
    );

    for (const a of alters) {
      try {
        await sql.query(a);
      } catch (e) {
        console.warn('Alter failed (non-fatal):', e.message || e);
      }
    }
    console.log('Column checks complete.');
  }

  // Ensure `id` column has a UUID type and a default generator
  try {
    const idInfo = await sql.query(
      "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='transactions' AND column_name='id';"
    );
    if (idInfo && idInfo[0]) {
      const col = idInfo[0];
      const dataType = String(col.data_type || '').toLowerCase();
      const hasDefault = !!col.column_default;
      if (!hasDefault) {
        console.log('Setting default for transactions.id to uuid_generate_v4()');
        try {
          await sql.query('ALTER TABLE transactions ALTER COLUMN id SET DEFAULT uuid_generate_v4();');
        } catch (e) {
          console.warn('Failed to set default on id (non-fatal):', e.message || e);
        }
      }
      if (!dataType.includes('uuid')) {
        console.log('Ensuring transactions.id is of type uuid (attempting safe cast)');
        try {
          await sql.query("ALTER TABLE transactions ALTER COLUMN id TYPE uuid USING (id::uuid);");
        } catch (e) {
          console.warn('Failed to cast id to uuid (non-fatal):', e.message || e);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to verify/repair id column (non-fatal):', e.message || e);
  }

  // Ensure currency column exists and is text
  try {
    await sql.query(
      'ALTER TABLE transactions ALTER COLUMN currency TYPE text USING currency::text;'
    );
  } catch (e) {
    // ignore if fails
  }

  // Convert existing timestamp columns to bigint epoch-ms if necessary
  try {
    const info = await sql.query(
      "SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='transactions' AND column_name IN ('created_at','updated_at','deleted_at');"
    );
    for (const col of info) {
      const name = col.column_name;
      const udt = String(col.udt_name || col.data_type).toLowerCase();
      if (udt.includes('timestamp') || udt.includes('timestamptz')) {
        console.log(`Converting column ${name} from timestamp -> bigint (epoch-ms)`);
        try {
          // If the column has a default that can't be cast, DROP it first.
          try {
            await sql.query(`ALTER TABLE transactions ALTER COLUMN ${name} DROP DEFAULT;`);
          } catch (e) {
            // ignore
          }
          await sql.query(
            `ALTER TABLE transactions ALTER COLUMN ${name} TYPE bigint USING (CASE WHEN ${name} IS NULL THEN NULL ELSE (EXTRACT(EPOCH FROM ${name}) * 1000)::bigint END);`
          );
          console.log(`Converted ${name} to bigint.`);
        } catch (e) {
          console.warn(`Failed to convert ${name}:`, e.message || e);
        }
      }
    }
  } catch (e) {
    console.warn('Timestamp conversion check failed (non-fatal):', e.message || e);
  }

  // Ensure summary tables and trigger functions exist
  try {
    console.log('Ensuring daily_summaries and monthly_summaries tables...');
    await sql.query(`
      CREATE TABLE IF NOT EXISTS daily_summaries (
        user_id uuid NOT NULL,
        date date NOT NULL,
        total_in numeric(18,2) DEFAULT 0,
        total_out numeric(18,2) DEFAULT 0,
        count int DEFAULT 0,
        updated_at timestamptz DEFAULT NOW(),
        PRIMARY KEY (user_id, date)
      );
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS monthly_summaries (
        user_id uuid NOT NULL,
        year int NOT NULL,
        month int NOT NULL,
        total_in numeric(18,2) DEFAULT 0,
        total_out numeric(18,2) DEFAULT 0,
        count int DEFAULT 0,
        updated_at timestamptz DEFAULT NOW(),
        PRIMARY KEY (user_id, year, month)
      );
    `);

    console.log('Creating upsert_monthly_summary and tr_upsert_daily_summary functions...');
    await sql.query(`
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
          AND (deleted_at IS NULL)
        GROUP BY user_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
        ON CONFLICT (user_id, year, month) DO UPDATE
          SET total_in = EXCLUDED.total_in,
              total_out = EXCLUDED.total_out,
              count = EXCLUDED.count,
              updated_at = NOW();
      END;
      $$ LANGUAGE plpgsql;
    `);

    await sql.query(`
      CREATE OR REPLACE FUNCTION tr_upsert_daily_summary()
      RETURNS TRIGGER AS $$
      DECLARE
        v_old_date DATE;
        v_new_date DATE;
      BEGIN
        IF (TG_OP = 'INSERT') THEN
          IF (NEW.deleted_at IS NOT NULL) THEN RETURN NEW; END IF;
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
          PERFORM upsert_monthly_summary(NEW.user_id, date_trunc('month', NEW.date)::date);
          RETURN NEW;
        END IF;

        IF (TG_OP = 'UPDATE') THEN
          v_old_date := OLD.date::date;
          v_new_date := NEW.date::date;
          IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
            IF (OLD.type = 'income') THEN
              UPDATE daily_summaries SET total_in = GREATEST(total_in - OLD.amount,0), count = GREATEST(count - 1,0), updated_at = NOW() WHERE user_id = OLD.user_id AND date = v_old_date;
            ELSE
              UPDATE daily_summaries SET total_out = GREATEST(total_out - OLD.amount,0), count = GREATEST(count - 1,0), updated_at = NOW() WHERE user_id = OLD.user_id AND date = v_old_date;
            END IF;
            PERFORM upsert_monthly_summary(OLD.user_id, date_trunc('month', OLD.date)::date);
            RETURN NEW;
          END IF;
          IF (OLD.deleted_at IS NULL) THEN
            IF (OLD.type = 'income') THEN
              UPDATE daily_summaries SET total_in = GREATEST(total_in - OLD.amount,0), count = GREATEST(count - 1,0), updated_at = NOW() WHERE user_id = OLD.user_id AND date = v_old_date;
            ELSE
              UPDATE daily_summaries SET total_out = GREATEST(total_out - OLD.amount,0), count = GREATEST(count - 1,0), updated_at = NOW() WHERE user_id = OLD.user_id AND date = v_old_date;
            END IF;
          END IF;
          IF (NEW.deleted_at IS NULL) THEN
            IF (NEW.type = 'income') THEN
              INSERT INTO daily_summaries(user_id, date, total_in, total_out, count, updated_at)
              VALUES (NEW.user_id, v_new_date, NEW.amount::numeric, 0, 1, NOW())
              ON CONFLICT (user_id, date) DO UPDATE SET total_in = daily_summaries.total_in + EXCLUDED.total_in, count = daily_summaries.count + 1, updated_at = NOW();
            ELSE
              INSERT INTO daily_summaries(user_id, date, total_in, total_out, count, updated_at)
              VALUES (NEW.user_id, v_new_date, 0, NEW.amount::numeric, 1, NOW())
              ON CONFLICT (user_id, date) DO UPDATE SET total_out = daily_summaries.total_out + EXCLUDED.total_out, count = daily_summaries.count + 1, updated_at = NOW();
            END IF;
          END IF;
          PERFORM upsert_monthly_summary(OLD.user_id, date_trunc('month', OLD.date)::date);
          PERFORM upsert_monthly_summary(NEW.user_id, date_trunc('month', NEW.date)::date);
          RETURN NEW;
        END IF;

        IF (TG_OP = 'DELETE') THEN
          IF (OLD.deleted_at IS NULL) THEN
            IF (OLD.type = 'income') THEN
              UPDATE daily_summaries SET total_in = GREATEST(total_in - OLD.amount,0), count = GREATEST(count - 1,0), updated_at = NOW() WHERE user_id = OLD.user_id AND date = OLD.date::date;
            ELSE
              UPDATE daily_summaries SET total_out = GREATEST(total_out - OLD.amount,0), count = GREATEST(count - 1,0), updated_at = NOW() WHERE user_id = OLD.user_id AND date = OLD.date::date;
            END IF;
          END IF;
          PERFORM upsert_monthly_summary(OLD.user_id, date_trunc('month', OLD.date)::date);
          RETURN OLD;
        END IF;

        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    console.log('Attaching trigger to transactions...');
    try {
      await sql.query('DROP TRIGGER IF EXISTS tr_summary_on_transactions ON transactions;');
      await sql.query("CREATE TRIGGER tr_summary_on_transactions AFTER INSERT OR UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION tr_upsert_daily_summary();");
    } catch (tErr) {
      console.warn('Failed to attach trigger (non-fatal):', tErr.message || tErr);
    }
  } catch (sErr) {
    console.warn('Summary creation failed (non-fatal):', sErr.message || sErr);
  }

  console.log('Done. Please re-run your migration and verify triggers if needed.');
  process.exit(0);
};

run().catch((e) => {
  console.error('Unexpected error:', e.message || e);
  process.exit(1);
});
