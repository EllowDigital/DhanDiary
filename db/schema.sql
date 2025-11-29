-- ===========================================================
--  USERS TABLE
-- ===========================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===========================================================
--  CASH ENTRIES (Cash In / Cash Out)
--  This schema is idempotent: safe to re-run on an existing database.
--  Includes `client_id` for client-side dedupe and `server_version` for
--  deterministic conflict resolution. A trigger bumps `server_version`
--  and updates `updated_at` on each insert/update.
-- ===========================================================
CREATE TABLE IF NOT EXISTS cash_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- "in" or "out"
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),

  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  note TEXT,
  currency TEXT DEFAULT 'INR',

  -- optional client-provided id used for deduplication when clients retry
  client_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  -- flag used by clients to indicate a local change needs to be pushed
  need_sync BOOLEAN NOT NULL DEFAULT FALSE,

  -- monotonic server-side version incremented on every write
  server_version INTEGER NOT NULL DEFAULT 0
);

-- ===========================================================
--  INDEXES
-- ===========================================================
CREATE INDEX IF NOT EXISTS idx_entries_user_id ON cash_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_entries_type ON cash_entries (type);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON cash_entries (created_at);
CREATE INDEX IF NOT EXISTS idx_entries_need_sync ON cash_entries (need_sync);
-- Unique index for client_id but allow multiple NULLs (partial index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_entries_client_id_unique ON cash_entries (client_id) WHERE client_id IS NOT NULL;

-- Ensure legacy databases gain the new columns if missing (idempotent)
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS need_sync BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS server_version INTEGER NOT NULL DEFAULT 0;

-- ===========================================================
--  TRIGGERS / HELPERS
--  Bump `server_version` and refresh `updated_at` on INSERT/UPDATE.
-- ===========================================================
-- NOTE: Automatic `server_version` bumping requires a PL/pgSQL trigger.
-- The migration runner used by `npm run migrate` splits statements by
-- semicolons and cannot safely execute dollar-quoted PL/pgSQL bodies.
--
-- To enable automatic bumping of `server_version` and updating
-- of `updated_at`, run the following in the Neon SQL editor (paste
-- the block below and execute as a single statement):
--
-- CREATE OR REPLACE FUNCTION trg_bump_server_version()
-- RETURNS trigger AS $$
-- BEGIN
--   IF (TG_OP = 'INSERT') THEN
--     NEW.server_version := COALESCE(NEW.server_version, 0) + 1;
--     NEW.created_at := COALESCE(NEW.created_at, NOW());
--     NEW.updated_at := NOW();
--     RETURN NEW;
--   ELSE
--     NEW.server_version := COALESCE(OLD.server_version, 0) + 1;
--     NEW.updated_at := NOW();
--     RETURN NEW;
--   END IF;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- DROP TRIGGER IF EXISTS trg_bump_server_version ON cash_entries;
-- CREATE TRIGGER trg_bump_server_version
-- BEFORE INSERT OR UPDATE ON cash_entries
-- FOR EACH ROW EXECUTE FUNCTION trg_bump_server_version();

