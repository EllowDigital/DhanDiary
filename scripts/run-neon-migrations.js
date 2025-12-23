#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const NEON_URL = process.env.NEON_URL || process.env.NEON_DATABASE_URL || null;
if (!NEON_URL) {
  console.error('NEON_URL environment variable is required.');
  process.exit(2);
}

const { neon } = require('@neondatabase/serverless');
const sql = neon(NEON_URL);

const schemaPath = path.resolve(__dirname, '..', 'db', 'schema.sql');
if (!fs.existsSync(schemaPath)) {
  console.error('schema.sql not found at', schemaPath);
  process.exit(3);
}

const run = async () => {
  try {
    const sqlText = fs.readFileSync(schemaPath, 'utf8');
    console.log('Connecting to Neon...');
    // Warm up connection
    try {
      await sql.query('SELECT 1');
      console.log('Connected to Neon successfully.');
    } catch (e) {
      console.error('Failed to connect to Neon:', e.message || e);
      process.exit(4);
    }

    console.log('Applying schema from', schemaPath);
    // Execute the whole file. Neon/pg allows multiple statements in one query.
    try {
      await sql.query(sqlText);
      console.log('Schema applied successfully.');
    } catch (e) {
      console.error('Schema execution error:', e.message || e);
      process.exit(5);
    }

    // Verification checks
    console.log('Running verification checks...');
    try {
      const tables = await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='public';");
      console.log('Public tables:', tables.map((r) => r.tablename).join(', '));

      const usersExists = await sql.query("SELECT to_regclass('public.users') as exists;");
      console.log('users table exists:', !!usersExists[0].exists);

      const entriesExists = await sql.query("SELECT to_regclass('public.cash_entries') as exists;");
      console.log('cash_entries table exists:', !!entriesExists[0].exists);

      console.log('Verification complete — Neon DB appears initialized.');
      process.exit(0);
    } catch (e) {
      console.error('Verification failed:', e.message || e);
      process.exit(6);
    }
  } catch (err) {
    console.error('Unexpected error:', err.message || err);
    process.exit(1);
  }
};

run();
