import sqlite from './sqlite';
import { notifySessionChanged } from '../utils/sessionEvents';

export type Session = { id: string; name: string; email: string } | null;

export const getSession = async (): Promise<Session> => {
  const db = await sqlite.open();
  const row = await db.get<{ id: string; name: string; email: string }>(
    'SELECT * FROM local_users LIMIT 1'
  );
  return row ? { id: row.id, name: row.name, email: row.email } : null;
};

export const saveSession = async (id: string, name: string, email: string) => {
  const db = await sqlite.open();
  const now = new Date().toISOString();
  await db.run(
    'INSERT OR REPLACE INTO local_users (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, email, now, now]
  );
  try {
    notifySessionChanged();
  } catch (e) {}
};

export const clearSession = async () => {
  const db = await sqlite.open();
  await db.run('DELETE FROM local_users');
  try {
    notifySessionChanged();
  } catch (e) {}
};

export default { getSession, saveSession, clearSession };
