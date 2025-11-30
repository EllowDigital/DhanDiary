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

const NEON_URL = process.env.NEON_URL;
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
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    try {
      await pool.end();
    } catch (e) {}
    process.exit(0);
  }
})();
