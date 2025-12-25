#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('@neondatabase/serverless');

const raw = process.env.NEON_URL || process.env.EXPO_PUBLIC_NEON_URL || '';
const NEON_URL = raw ? String(raw).trim().replace(/^'+|'+$|^"+|"+$/g, '') : '';
if (!NEON_URL) {
  console.error('NEON_URL not set in env');
  process.exit(2);
}

const pool = new Pool({ connectionString: NEON_URL });

(async () => {
  let userId = null;
  let entryId = null;
  try {
    const ts = Date.now();
    const email = `integration+${ts}@example.com`;
    const clerkId = `integration-clerk-${ts}`;

    // Create a test user
    const u = await pool.query(
      'INSERT INTO users (email, password_hash, name, clerk_id) VALUES ($1,$2,$3,$4) RETURNING id',
      [email, 'testhash', 'Integration Test', clerkId]
    );
    userId = u && (u.rows ? u.rows[0].id : u[0].id);
    console.log('Created test user id=', userId);

    // Insert a cash entry
    const clientId = `cli-${ts}`;
    const amount = 12.34;
    const res = await pool.query(
      `INSERT INTO cash_entries (user_id, client_id, type, amount, category, note, currency, created_at, updated_at, date) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW(),NOW()) RETURNING id` ,
      [userId, clientId, 'in', amount, 'integration', 'test insert', 'INR']
    );
    entryId = res && (res.rows ? res.rows[0].id : res[0].id);
    console.log('Inserted cash_entries id=', entryId);

    // Allow a short moment (shouldn't be necessary, but give DB time)
    await new Promise((r) => setTimeout(r, 500));

    // Check daily_summaries
    const daily = await pool.query(`SELECT total_in, total_out, count FROM daily_summaries WHERE user_id = $1 AND date = CURRENT_DATE LIMIT 1`, [userId]);
    const dr = daily && (daily.rows ? daily.rows[0] : daily[0]);
    console.log('daily summary row:', dr || null);

    if (!dr) {
      throw new Error('daily_summaries row not found for inserted entry');
    }
    if (Number(dr.total_in) < amount) {
      throw new Error(`daily_summaries total_in (${dr.total_in}) is less than inserted amount ${amount}`);
    }
    if (Number(dr.count) < 1) {
      throw new Error(`daily_summaries count (${dr.count}) is incorrect`);
    }

    // Check monthly_summaries
    const month = await pool.query(`SELECT total_in, total_out, count FROM monthly_summaries WHERE user_id = $1 AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int AND month = EXTRACT(MONTH FROM CURRENT_DATE)::int LIMIT 1`, [userId]);
    const mr = month && (month.rows ? month.rows[0] : month[0]);
    console.log('monthly summary row:', mr || null);

    if (!mr) {
      throw new Error('monthly_summaries row not found for inserted entry');
    }
    if (Number(mr.total_in) < amount) {
      throw new Error(`monthly_summaries total_in (${mr.total_in}) is less than inserted amount ${amount}`);
    }

    console.log('Integration test succeeded.');
    process.exit(0);
  } catch (err) {
    console.error('Integration test failed:', err && err.message ? err.message : err);
    try {
      // Attempt cleanup even on failure
      if (entryId) await pool.query('DELETE FROM cash_entries WHERE id = $1', [entryId]);
      if (userId) {
        await pool.query('DELETE FROM daily_summaries WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM monthly_summaries WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      }
    } catch (cleanupErr) {
      console.warn('Cleanup after failure also failed:', cleanupErr && cleanupErr.message ? cleanupErr.message : cleanupErr);
    }
    process.exit(3);
  } finally {
    try { await pool.end(); } catch (e) {}
  }
})();
