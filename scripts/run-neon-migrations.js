#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Load .env when present so users can put NEON_URL in a .env file
try {
  const dotenv = require('dotenv');
  const root = path.resolve(__dirname, '..');
  // try several common dotenv filenames
  const candidates = ['.env', '.env.local', '.env.development'];
  for (const f of candidates) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      console.log(`Loaded environment from ${f}`);
      break;
    }
  }
} catch (e) {
  // ignore if dotenv not installed
}

// Try multiple sources for NEON_URL: env var, NEON_DATABASE_URL, or app.json extra
let NEON_URL = process.env.NEON_URL || process.env.NEON_DATABASE_URL || null;
if (!NEON_URL) {
  try {
    const appJsonPath = path.resolve(__dirname, '..', 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      if (appJson && appJson.expo && appJson.expo.extra && appJson.expo.extra.NEON_URL) {
        NEON_URL = appJson.expo.extra.NEON_URL;
        console.log('Loaded NEON_URL from app.json extra');
      }
    }
  } catch (e) {
    // ignore
  }
}

if (!NEON_URL) {
  console.error('NEON_URL not found. Set the NEON_URL or NEON_DATABASE_URL environment variable, or add it to app.json > expo.extra or a .env file.');
  process.exit(2);
}

const { neon } = require('@neondatabase/serverless');
const sql = neon(NEON_URL);
console.log('Using NEON_URL:', NEON_URL.replace(/(.*:\/\/)([^:]+):(.+)@(.+)/, '$1****:****@$4') || '[masked]');

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
    // Split SQL into individual statements safely (respect dollar-quoted function bodies
    // and quoted strings) because the Neon HTTP driver rejects multiple statements in one request.
    const splitSqlStatements = (input) => {
      const out = [];
      let cur = '';
      let i = 0;
      let inSingle = false;
      let inDouble = false;
      let inDollar = null; // stores tag like $tag$

      while (i < input.length) {
        const ch = input[i];

        // handle start of dollar-quote
        if (!inSingle && !inDouble && !inDollar && ch === '$') {
          // try to read tag
          const m = input.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
          if (m) {
            inDollar = m[0];
            cur += m[0];
            i += m[0].length;
            continue;
          }
        }

        // handle end of dollar-quote
        if (inDollar) {
          if (input.slice(i, i + inDollar.length) === inDollar) {
            cur += inDollar;
            i += inDollar.length;
            inDollar = null;
            continue;
          } else {
            cur += ch;
            i += 1;
            continue;
          }
        }

        // inside single quoted string
        if (ch === "'" && !inDouble) {
          cur += ch;
          // check for escaped single quote by doubling
          if (inSingle && input[i + 1] === "'") {
            // consume doubled quote
            cur += "'";
            i += 2;
            continue;
          }
          inSingle = !inSingle;
          i += 1;
          continue;
        }

        // inside double quoted string
        if (ch === '"' && !inSingle) {
          cur += ch;
          if (inDouble && input[i + 1] === '"') {
            cur += '"';
            i += 2;
            continue;
          }
          inDouble = !inDouble;
          i += 1;
          continue;
        }

        // statement separator
        if (ch === ';' && !inSingle && !inDouble && !inDollar) {
          const t = cur.trim();
          if (t) out.push(t + ';');
          cur = '';
          i += 1;
          continue;
        }

        cur += ch;
        i += 1;
      }

      const rem = cur.trim();
      if (rem) out.push(rem);
      return out;
    };

    const statements = splitSqlStatements(sqlText);
    console.log('Parsed', statements.length, 'statements');
    try {
      for (let idx = 0; idx < statements.length; idx++) {
        const stmt = statements[idx];
        const preview = stmt.replace(/\n+/g, ' ').slice(0, 120);
        console.log(`Executing statement ${idx + 1}/${statements.length}:`, preview);
        await sql.query(stmt);
      }
      console.log('Schema applied successfully.');
    } catch (e) {
      console.error('Schema execution error on statement:', e.message || e);
      // try to provide index/context if possible
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
