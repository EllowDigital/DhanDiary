import sqlite from './sqlite';
import { notifySessionChanged } from '../utils/sessionEvents';
import AsyncStorage from '@react-native-async-storage/async-storage';

import migrations from './migrations';

export type Session = { id: string; name: string; email: string } | null;

const ensureMigrations = async () => {
  try {
    await migrations.runMigrations();
  } catch (e) {
    // ignore — migrations are best-effort here
  }
};

export const getSession = async (): Promise<Session> => {
  try {
    const db = await sqlite.open();
    const row = await db.get<{ id: string; name: string; email: string }>(
      'SELECT * FROM local_users LIMIT 1'
    );
    return row ? { id: row.id, name: row.name, email: row.email } : null;
  } catch (e: any) {
    // If the table doesn't exist yet, attempt to run migrations and retry once.
    const msg = String(e && e.message ? e.message : e);
    // If sqlite isn't ready or table missing, try fallback in AsyncStorage so app can continue
    try {
      const fallbackRaw = await AsyncStorage.getItem('FALLBACK_SESSION');
      if (fallbackRaw) {
        try {
          const parsed = JSON.parse(fallbackRaw);
          // Try to migrate fallback into sqlite in background
          (async () => {
            try {
              await ensureMigrations();
              const db = await sqlite.open();
              const now = new Date().toISOString();
              await db.run(
                'INSERT OR REPLACE INTO local_users (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                [parsed.id, parsed.name || null, parsed.email || null, now, now]
              );
              // clear fallback once migrated
              await AsyncStorage.removeItem('FALLBACK_SESSION');
              try {
                notifySessionChanged();
              } catch (e) {}
            } catch (e) {}
          })();

          return { id: parsed.id, name: parsed.name, email: parsed.email };
        } catch (e) {
          // ignore parse errors
        }
      }
    } catch (e) {
      // ignore AsyncStorage failures
    }

    if (msg.toLowerCase().includes('no such table') || msg.toLowerCase().includes('no such')) {
      await ensureMigrations();
      try {
        const db = await sqlite.open();
        const row = await db.get<{ id: string; name: string; email: string }>(
          'SELECT * FROM local_users LIMIT 1'
        );
        return row ? { id: row.id, name: row.name, email: row.email } : null;
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
};

export const saveSession = async (id: string, name: string, email: string) => {
  try {
    const db = await sqlite.open();
    const now = new Date().toISOString();
    await db.run(
      'INSERT OR REPLACE INTO local_users (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, name, email, now, now]
    );
    try {
      notifySessionChanged();
    } catch (e) {}
  } catch (e: any) {
    const msg = String(e && e.message ? e.message : e);
    // If sqlite table doesn't exist or sqlite unavailable, store fallback in AsyncStorage
    if (msg.toLowerCase().includes('no such table') || msg.toLowerCase().includes('no such')) {
      try {
        await ensureMigrations();
        const db = await sqlite.open();
        const now = new Date().toISOString();
        await db.run(
          'INSERT OR REPLACE INTO local_users (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          [id, name, email, now, now]
        );
        try {
          notifySessionChanged();
        } catch (e) {}
        return;
      } catch (e2) {
        // fallback to AsyncStorage
        try {
          await AsyncStorage.setItem('FALLBACK_SESSION', JSON.stringify({ id, name, email }));
          try {
            notifySessionChanged();
          } catch (e3) {}
        } catch (e3) {
          // give up
        }
        return;
      }
    }
  }
};

export const clearSession = async () => {
  try {
    const db = await sqlite.open();
    await db.run('DELETE FROM local_users');
    try {
      notifySessionChanged();
    } catch (e) {}
  } catch (e: any) {
    const msg = String(e && e.message ? e.message : e);
    if (msg.toLowerCase().includes('no such table') || msg.toLowerCase().includes('no such')) {
      await ensureMigrations();
      try {
        const db = await sqlite.open();
        await db.run('DELETE FROM local_users');
        try {
          notifySessionChanged();
        } catch (e) {}
      } catch (e2) {
        // ignore
      }
    }
  }
};

export default { getSession, saveSession, clearSession };
