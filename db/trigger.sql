-- Trigger to bump server_version and refresh updated_at on cash_entries
-- Run this as a single statement in Neon SQL editor or via psql.

CREATE OR REPLACE FUNCTION trg_bump_server_version()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    NEW.server_version := COALESCE(NEW.server_version, 0) + 1;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := NOW();
    RETURN NEW;
  ELSE
    NEW.server_version := COALESCE(OLD.server_version, 0) + 1;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_server_version ON cash_entries;
CREATE TRIGGER trg_bump_server_version
BEFORE INSERT OR UPDATE ON cash_entries
FOR EACH ROW EXECUTE FUNCTION trg_bump_server_version();
