// SQLite is fully disabled in this build. All functions throw if called.
const open = async () => {
  throw new Error('SQLite is disabled: use NeonDB and Clerk only.');
};

export default {
  open,
};
    try {
      await db.exec('PRAGMA journal_mode = WAL');
      console.log('[sqlite] WAL enabled');
    } catch (e) {
      console.warn('[sqlite] WAL not available', e);
    }

    LAST_DB = db;
    console.log('[sqlite] open complete');
    return db;
  })();

  return DB_INSTANCE;
};

const close = async () => {
  try {
    const db = LAST_DB || (DB_INSTANCE ? await DB_INSTANCE : null);
    if (!db || !db.raw) return;
    const raw = db.raw;
    console.log('[sqlite] closing DB');
    if (typeof raw.closeAsync === 'function') {
      await raw.closeAsync();
    } else if (typeof raw.close === 'function') {
      raw.close();
    } else if (raw._db && typeof raw._db.close === 'function') {
      raw._db.close();
    }
  } catch (e) {
    // ignore close failures
  } finally {
    LAST_DB = null;
    DB_INSTANCE = null;
  }
};

const resolveSqliteDir = () => {
  const fsAny = FileSystem as any;
  const documentDir = typeof fsAny.documentDirectory === 'string' ? fsAny.documentDirectory : null;
  const cacheDir = typeof fsAny.cacheDirectory === 'string' ? fsAny.cacheDirectory : null;
  if (documentDir) return `${documentDir}SQLite`;
  if (cacheDir) return `${cacheDir}SQLite`;
  return null;
};

const deleteDbFile = async () => {
  await close();
  const baseDir = resolveSqliteDir();
  if (!baseDir) return;

  console.log('[sqlite] deleting DB files in', baseDir);

  const suffixes = ['', '-wal', '-shm'];
  for (const suffix of suffixes) {
    const path = `${baseDir}/${DB_NAME}${suffix}`;
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
      }
    } catch (e) {
      // ignore individual delete failures
    }
  }
};

export default { open, close, deleteDbFile };
