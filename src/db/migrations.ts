import sqlite from './sqlite';

type Migration = { id: number; up: (db: Awaited<ReturnType<typeof sqlite.open>>) => Promise<void> };

const migrations: Migration[] = [
  {
    id: 1,
    up: async (db) => {
      await db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)`);
      // Ensure an initial row exists. Use INSERT OR IGNORE to avoid selecting
      // the table immediately after creation which can race on some runtimes.
      await db.run('INSERT OR IGNORE INTO schema_version (version) VALUES (?)', [1]);

      await db.run(`CREATE TABLE IF NOT EXISTS local_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS local_entries (
        local_id TEXT PRIMARY KEY,
        remote_id TEXT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('in','out')),
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT,
        date TEXT,
        currency TEXT DEFAULT 'INR',
        server_version INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_synced INTEGER DEFAULT 0,
        need_sync INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0
      )`);

      await db.run(
        `CREATE INDEX IF NOT EXISTS idx_entries_user_created ON local_entries (user_id, created_at)`
      );
      await db.run(`CREATE INDEX IF NOT EXISTS idx_entries_remote ON local_entries (remote_id)`);
      await db.run(
        `CREATE INDEX IF NOT EXISTS idx_entries_needsync ON local_entries (need_sync, is_deleted)`
      );

      await db.run(`CREATE TABLE IF NOT EXISTS pending_profile_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT,
        email TEXT,
        created_at TEXT,
        processed INTEGER DEFAULT 0
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS queued_remote_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        queued_at TEXT,
        attempts INTEGER DEFAULT 0
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS queued_local_remote_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        local_id TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        queued_at TEXT,
        attempts INTEGER DEFAULT 0
      )`);
    },
  },
  {
    id: 2,
    up: async (db) => {
      // Add server_version to local_entries if missing (idempotent)
      try {
        await db.run('ALTER TABLE local_entries ADD COLUMN server_version INTEGER DEFAULT 0');
      } catch (e) {
        // Some sqlite builds don't support ALTER TABLE ADD COLUMN IF NOT EXISTS — ignore errors
      }
    },
  },
];

export const runMigrations = async () => {
  const db = await sqlite.open();
  // read current version; if the schema_version table doesn't exist yet,
  // treat it as an empty DB (version 0) and continue to apply migrations.
  let currentVersion = 0;
  try {
    const cur = await db.get<{ version: number }>(
      'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
    );
    currentVersion = cur ? cur.version : 0;
  } catch (e) {
    // likely no schema_version table yet — proceed with migrations from 0
    currentVersion = 0;
  }

  console.log('[migrations] currentVersion=', currentVersion);
  const pending = migrations.filter((m) => m.id > currentVersion).sort((a, b) => a.id - b.id);
  console.log('[migrations] pending ids=', pending.map((p) => p.id));
  for (const m of pending) {
    console.log('[migrations] applying', m.id);
    await m.up(db);
    // record version
    await db.run('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [m.id]);
    console.log('[migrations] applied', m.id);
  }
};

export default { runMigrations };
