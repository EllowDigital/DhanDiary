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
    console.log('Ensuring required columns exist (id, user_id, client_id, type, amount, category, note, currency, created_at, updated_at, deleted_at, date, server_version)...');
    const alters = [];
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS client_id uuid;");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS type text;");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount numeric(18,2);");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category text;");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note text;");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency text DEFAULT 'INR';");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at bigint;");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at bigint;");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS deleted_at bigint;");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS date timestamptz;");
    alters.push("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS server_version bigint DEFAULT 0;");

    for (const a of alters) {
      try {
        await sql.query(a);
      } catch (e) {
        console.warn('Alter failed (non-fatal):', e.message || e);
      }
    }
    console.log('Column checks complete.');
  }

  // Ensure currency column exists and is text
  try {
    await sql.query("ALTER TABLE transactions ALTER COLUMN currency TYPE text USING currency::text;");
  } catch (e) {
    // ignore if fails
  }

  console.log('Done. Please re-run your migration and verify triggers if needed.');
  process.exit(0);
};

run().catch((e) => {
  console.error('Unexpected error:', e.message || e);
  process.exit(1);
});
