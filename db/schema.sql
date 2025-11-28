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

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  -- flag used by clients to indicate a local change needs to be pushed
  need_sync BOOLEAN NOT NULL DEFAULT FALSE
);

-- ===========================================================
--  INDEXES
-- ===========================================================
CREATE INDEX IF NOT EXISTS idx_entries_user_id ON cash_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_entries_type ON cash_entries (type);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON cash_entries (created_at);
-- Ensure the `need_sync` column exists for older databases (safe idempotent migration)
ALTER TABLE cash_entries ADD COLUMN IF NOT EXISTS need_sync BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_entries_need_sync ON cash_entries (need_sync);
