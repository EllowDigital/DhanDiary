import sqlite from './sqlite';
import { notifySessionChanged } from '../utils/sessionEvents';

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
    if (msg.toLowerCase().includes('no such table') || msg.toLowerCase().includes('no such')) {
      await ensureMigrations();
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
      } catch (e2) {
        // give up
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
