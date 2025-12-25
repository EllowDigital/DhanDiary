#!/usr/bin/env node
/*
  Migration runner that applies SQL statements from db/schema.sql
  to the NeonDB specified by NEON_URL in environment (.env or env vars).
*/
try {
  require('dotenv').config({ quiet: true });
} catch (e) {
  try {
    require('dotenv').config();
  } catch (ee) {}
}
const fs = require('fs');
const path = require('path');
const { Pool } = require('@neondatabase/serverless');

// Normalize NEON_URL from env and strip accidental quotes/spaces
const rawNeon = process.env.NEON_URL || process.env.EXPO_PUBLIC_NEON_URL || '';
const NEON_URL = rawNeon ? String(rawNeon).trim().replace(/^'+|'+$|^"+|"+$/g, '') : '';
if (!NEON_URL) {
  console.error('NEON_URL is not set. Set it in .env or environment variables.');
  process.exit(1);
}

const pool = new Pool({ connectionString: NEON_URL });

(async () => {
  try {
    const sqlPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Try executing the full SQL file as a single query. This allows
    // dollar-quoted PL/pgSQL function/triggers to be created in one go.
    // If the server rejects multi-statement execution, fall back to
    // per-statement execution (the original behavior).
    try {
        console.log('Running full SQL file as single query');
        await pool.query(sql);
    } catch (err) {
      console.warn(
        'Full-file execution failed, falling back to statement-by-statement execution:',
        err.message || err
      );
      // Split into statements by semicolon; this is acceptable for plain DDL
      const rawStatements = sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of rawStatements) {
        if (stmt.length < 3) continue;
        console.log('Running:', stmt.split('\n')[0].slice(0, 120));
        try {
          await pool.query(stmt);
        } catch (err2) {
          // Log and continue so a single failing statement doesn't stop the run
          console.error('Statement error (continuing):', err2.message || err2);
        }
      }
    }

    // If a separate trigger file exists, try running it as a single statement
    try {
      const triggerPath = require('path').join(__dirname, '..', 'db', 'trigger.sql');
      const fs = require('fs');
      if (fs.existsSync(triggerPath)) {
        const triggerSql = fs.readFileSync(triggerPath, 'utf8');
        try {
          console.log('Running trigger SQL as single query');
          await pool.query(triggerSql);
        } catch (tErr) {
          console.warn('Trigger SQL execution failed (continuing):', tErr.message || tErr);
        }
      }
    } catch (e) {
      // ignore failures around trigger execution
    }

    console.log('Migration finished.');
    // Optional backfill: run heavy backfill when BACKFILL=1 in env
    if (process.env.BACKFILL === '1') {
      try {
        console.log('Running backfill for daily_summaries... (this may take time)');
        const backfillDaily = `
          INSERT INTO daily_summaries (user_id, date, total_in, total_out, count, updated_at)
          SELECT user_id, date::date,
            COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END),0)::numeric(18,2),
            COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END),0)::numeric(18,2),
            COUNT(*)::int,
            NOW()
          FROM cash_entries
          WHERE NOT deleted
          GROUP BY user_id, date::date
          ON CONFLICT (user_id, date) DO UPDATE
            SET total_in = EXCLUDED.total_in,
                total_out = EXCLUDED.total_out,
                count = EXCLUDED.count,
                updated_at = NOW();
        `;
        await pool.query(backfillDaily);
        console.log('Daily backfill complete.');

        console.log('Running backfill for monthly_summaries...');
        const backfillMonthly = `
          INSERT INTO monthly_summaries (user_id, year, month, total_in, total_out, count, updated_at)
          SELECT user_id,
            EXTRACT(YEAR FROM date)::INT,
            EXTRACT(MONTH FROM date)::INT,
            COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END),0)::numeric(18,2),
            COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END),0)::numeric(18,2),
            COUNT(*)::int,
            NOW()
          FROM cash_entries
          WHERE NOT deleted
          GROUP BY user_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
          ON CONFLICT (user_id, year, month) DO UPDATE
            SET total_in = EXCLUDED.total_in,
                total_out = EXCLUDED.total_out,
                count = EXCLUDED.count,
                updated_at = NOW();
        `;
        await pool.query(backfillMonthly);
        console.log('Monthly backfill complete.');
      } catch (bfErr) {
        console.error('Backfill failed:', bfErr && bfErr.message ? bfErr.message : bfErr);
      }
    }

    // If BACKFILL not explicitly requested, optionally run AUTO_BACKFILL when summaries table exists and is empty
    try {
      if (process.env.BACKFILL === '1') {
        console.log('BACKFILL=1 was used; skipping AUTO_BACKFILL detection.');
      } else {
      const checkTable = await pool.query(
        "SELECT to_regclass('public.daily_summaries') IS NOT NULL AS exists"
      );
      const checkRow = checkTable && checkTable.rows && checkTable.rows[0];
      const tableExists = checkRow && (checkRow.exists === true || checkRow.exists === 't');
      if (!tableExists) {
        console.log('daily_summaries table does not exist yet; skipping AUTO_BACKFILL check.');
      } else {
        const res = await pool.query('SELECT count(*)::bigint AS cnt FROM daily_summaries');
        const first = res && res.rows && res.rows[0];
        const cnt = first ? Number(first.cnt || first.count || 0) : 0;
        if ((cnt === 0 || isNaN(cnt)) && process.env.AUTO_BACKFILL === '1') {
          console.log('daily_summaries appears empty and AUTO_BACKFILL=1; running backfill now.');
          try {
            const backfillDaily = `
              INSERT INTO daily_summaries (user_id, date, total_in, total_out, count, updated_at)
              SELECT user_id, date::date,
                COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END),0)::numeric(18,2),
                COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END),0)::numeric(18,2),
                COUNT(*)::int,
                NOW()
              FROM cash_entries
              WHERE NOT deleted
              GROUP BY user_id, date::date
              ON CONFLICT (user_id, date) DO UPDATE
                SET total_in = EXCLUDED.total_in,
                    total_out = EXCLUDED.total_out,
                    count = EXCLUDED.count,
                    updated_at = NOW();
            `;
            await pool.query(backfillDaily);
            console.log('AUTO backfill daily complete.');
          } catch (bfErr) {
            console.error('AUTO backfill daily failed:', bfErr && bfErr.message ? bfErr.message : bfErr);
          }
        } else {
          console.log('daily_summaries already populated (rows=', cnt, '), skipping AUTO backfill.');
        }
      }
    }
    } catch (e) {
      console.warn('Could not inspect daily_summaries table (it may not exist yet):', e && e.message ? e.message : e);
    }
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    try {
      await pool.end();
    } catch (e) {}
    process.exit(0);
  }
})();
