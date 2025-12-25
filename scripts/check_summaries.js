#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('@neondatabase/serverless');

const raw = process.env.NEON_URL || process.env.EXPO_PUBLIC_NEON_URL || '';
const NEON_URL = raw
  ? String(raw)
      .trim()
      .replace(/^'+|'+$|^"+|"+$/g, '')
  : '';
if (!NEON_URL) {
  console.error('NEON_URL not set in env');
  process.exit(1);
}

const pool = new Pool({ connectionString: NEON_URL });

(async () => {
  try {
    const d = await pool.query('SELECT count(*)::bigint AS cnt FROM daily_summaries');
    const dr = d && (d.rows ? d.rows[0] : d[0]);
    console.log('daily_summaries rows:', dr ? dr.cnt : 'unknown');

    const m = await pool.query('SELECT count(*)::bigint AS cnt FROM monthly_summaries');
    const mr = m && (m.rows ? m.rows[0] : m[0]);
    console.log('monthly_summaries rows:', mr ? mr.cnt : 'unknown');
  } catch (e) {
    console.error('Error querying summaries:', e && e.message ? e.message : e);
  } finally {
    try {
      await pool.end();
    } catch (e) {}
    process.exit(0);
  }
})();
