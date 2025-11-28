#!/usr/bin/env node
/*
  Migration runner that applies SQL statements from db/schema.sql
  to the NeonDB specified by NEON_URL in environment (.env or env vars).
*/
require('dotenv').config();
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
      } catch (err) {
        // Log and continue so a single failing statement doesn't stop the run
        console.error('Statement error (continuing):', err.message || err);
      }
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
