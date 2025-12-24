import sqlite from './sqlite';
import migrations from './migrations';
import { notifySessionChanged } from '../utils/sessionEvents';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Session = { id: string; name: string; email: string } | null;

const FALLBACK_KEY = 'FALLBACK_SESSION';

/**
 * Helper: Executes a DB operation. If it fails due to missing tables,
 * it runs migrations and retries exactly once.
 */
const withDbRetry = async <T>(operation: (db: any) => Promise<T>): Promise<T> => {
  try {
    const db = await sqlite.open();
    return await operation(db);
  } catch (e: any) {
    const msg = String(e?.message || e).toLowerCase();
    // Check for "no such table" error
    if (msg.includes('no such table') || msg.includes('no such')) {
      try {
        await migrations.runMigrations();
        const db = await sqlite.open();
        return await operation(db);
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw e;
  }
};

/**
 * Retrieves the current user session.
 * Priority: SQLite -> AsyncStorage (Fallback)
 */
export const getSession = async (): Promise<Session> => {
  // 1. Try reading from SQLite
  try {
    const row = await withDbRetry(async (db) => {
      return await db.get<{ id: string; name: string; email: string }>(
        'SELECT * FROM local_users LIMIT 1'
      );
    });

    if (row) {
      return { id: row.id, name: row.name, email: row.email };
    }
  } catch (e) {
    console.warn('[Session] SQLite read failed, attempting fallback', e);
  }

  // 2. SQLite failed or empty: Check AsyncStorage fallback
  try {
    const fallbackRaw = await AsyncStorage.getItem(FALLBACK_KEY);
    if (fallbackRaw) {
      const parsed = JSON.parse(fallbackRaw);
      
      // SELF-HEALING: If we found data in fallback but SQLite failed,
      // try to restore it to SQLite now so we recover for next time.
      saveSessionToSqlite(parsed.id, parsed.name, parsed.email).catch((err) => {
        console.warn('[Session] Failed to restore fallback to SQLite', err);
      });

      return { id: parsed.id, name: parsed.name, email: parsed.email };
    }
  } catch (e) {
    // ignore fallback errors
  }

  return null;
};

/**
 * Internal helper to write specifically to SQLite without fallback logic
 */
const saveSessionToSqlite = async (id: string, name: string, email: string) => {
  await withDbRetry(async (db) => {
    const now = new Date().toISOString();
    await db.run(
      'INSERT OR REPLACE INTO local_users (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, email, now, now]
    );
  });
};

/**
 * Saves a new session. 
 * Tries SQLite first. If that fails, saves to AsyncStorage so the user stays logged in.
 */
export const saveSession = async (id: string, name: string, email: string) => {
  let savedToSqlite = false;

  // 1. Try SQLite
  try {
    await saveSessionToSqlite(id, name, email);
    savedToSqlite = true;
    // If successful, clear any stale fallback to keep sources in sync
    await AsyncStorage.removeItem(FALLBACK_KEY).catch(() => {});
  } catch (e) {
    console.error('[Session] SQLite save failed, using fallback', e);
  }

  // 2. If SQLite failed, use AsyncStorage
  if (!savedToSqlite) {
    try {
      await AsyncStorage.setItem(FALLBACK_KEY, JSON.stringify({ id, name, email }));
    } catch (e) {
      console.error('[Session] Critical: Failed to save session to both DB and Fallback', e);
    }
  }

  // 3. Notify listeners
  try {
    notifySessionChanged();
  } catch (e) {}
};

/**
 * Clears the session from all storage engines.
 */
export const clearSession = async () => {
  // 1. Clear SQLite
  try {
    await withDbRetry(async (db) => {
      await db.run('DELETE FROM local_users');
    });
  } catch (e) {
    console.warn('[Session] Failed to clear SQLite session', e);
  }

  // 2. Clear Fallback
  try {
    await AsyncStorage.removeItem(FALLBACK_KEY);
  } catch (e) {
    console.warn('[Session] Failed to clear fallback session', e);
  }

  // 3. Notify listeners
  try {
    notifySessionChanged();
  } catch (e) {}
};

export default { getSession, saveSession, clearSession };