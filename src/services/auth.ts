import NetInfo from '@react-native-community/netinfo';
import { query } from '../api/neonClient';
import { saveSession, clearSession, getSession } from '../db/session';
import {
  addPendingProfileUpdate,
  clearAllData,
  init as initDb,
  wipeLocalDatabase,
} from '../db/localDb';
import { getOfflineDbOwner, setOfflineDbOwner } from '../db/offlineOwner';
import sqlite from '../db/sqlite';
import bcrypt from 'bcryptjs';
import Constants from 'expo-constants';

const resolveNeonUrl = () =>
  (Constants?.expoConfig?.extra as any)?.NEON_URL || process.env.NEON_URL || null;

// Utility: helper to fail fast on slow network operations
// Increase default timeout to 15s for mobile networks which may be slower.
const withTimeout = <T>(p: Promise<T>, ms = 15000): Promise<T> => {
  return Promise.race([
    p,
    new Promise<T>((_res, rej) => setTimeout(() => rej(new Error('Request timed out')), ms)),
  ] as any);
};

// Rely on `react-native-get-random-values` polyfill (imported in App.tsx)
// so `crypto.getRandomValues` is available for uuid/bcrypt usage.

export const isOnline = async () => {
  const state = await NetInfo.fetch();
  // isInternetReachable can be null initially, so we check isConnected too
  return state.isConnected;
};

let neonWarmPromise: Promise<boolean> | null = null;
let lastNeonWarm = 0;
const NEON_WARM_CACHE_MS = 60_000;

export const warmNeonConnection = async (opts: { force?: boolean; timeoutMs?: number } = {}) => {
  const NEON_URL = resolveNeonUrl();
  if (!NEON_URL) return false;
  const online = await isOnline();
  if (!online) return false;

  const now = Date.now();
  if (!opts.force && now - lastNeonWarm < NEON_WARM_CACHE_MS && !neonWarmPromise) return true;

  if (!neonWarmPromise) {
    const timeoutMs = opts.timeoutMs ?? 15000;
    neonWarmPromise = withTimeout(query('SELECT 1'), timeoutMs)
      .then(() => {
        lastNeonWarm = Date.now();
        return true;
      })
      .catch((err) => {
        console.warn('Neon warm-up failed', err?.message || err);
        return false;
      })
      .finally(() => {
        neonWarmPromise = null;
      });
  }

  try {
    return await neonWarmPromise;
  } catch (e) {
    return false;
  }
};

const prepareOfflineWorkspace = async (userId: string) => {
  await initDb();
  let owner: string | null = null;
  try {
    owner = await getOfflineDbOwner();
  } catch (e) {
    owner = null;
  }

  if (owner && owner !== userId) {
    await clearAllData({ includeSession: false });
  }

  if (owner !== userId) {
    await setOfflineDbOwner(userId);
  }

  let hasExisting = false;
  try {
    const db = await sqlite.open();
    const row = await db.get<{ total: number }>(
      'SELECT COUNT(1) as total FROM local_entries WHERE user_id = ?',
      [userId]
    );
    hasExisting = !!(row && Number(row.total) > 0);
  } catch (e) {
    hasExisting = false;
  }

  if (!hasExisting) {
    // Run sync in background so we don't block login/signup
    const { syncBothWays } = require('./syncManager');
    syncBothWays().catch((e: any) => {
      console.warn('Background initial sync after login failed', e);
    });
  }
};

export const registerOnline = async (name: string, email: string, password: string) => {
  // If NEON_URL is not configured, skip remote registration and create a local session for dev/test
  const NEON_URL = resolveNeonUrl();
  if (!NEON_URL) {
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    await saveSession(id, name || '', email);
    await prepareOfflineWorkspace(id);
    return { id, name, email };
  }

  // Attempt remote Neon registration
  const online = await isOnline();
  if (!online) throw new Error('Online required for registration');

  // Start hashing in parallel with other checks if possible, but here we need it for query
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  try {
    // Attempt insert directly. If email exists, it will throw a unique constraint violation.
    const result = await withTimeout(
      query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name, email, hash]
      ),
      20000
    );

    const user = result[0];
    await saveSession(user.id, user.name || '', user.email);
    // await offline workspace setup but sync is now backgrounded
    await prepareOfflineWorkspace(user.id);
    return user;
  } catch (err: any) {
    // Check for unique constraint violation
    if (
      err?.code === '23505' ||
      (err?.message && err.message.includes('unique constraint') && err.message.includes('email'))
    ) {
      throw new Error('User already exists');
    }
    throw err;
  }
};

export const loginOnline = async (email: string, password: string) => {
  const online = await isOnline();
  if (!online) throw new Error('Online required for login');

  // Removed explicit warming to save a round trip. The main query will warm if needed.
  // fail fast on slow responses
  const result = await withTimeout(query('SELECT * FROM users WHERE email = $1', [email]), 20000);
  if (result.length === 0) {
    throw new Error('User not found');
  }

  const user = result[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw new Error('Invalid password');
  }
  await saveSession(user.id, user.name || '', user.email);
  await prepareOfflineWorkspace(user.id);
  return user;
};

export const logout = async () => {
  try {
    // attempt a final sync before clearing session so pending local changes are pushed
    const { syncBothWays } = require('./syncManager');
    try {
      await syncBothWays();
    } catch (e) {
      // ignore sync failures during logout
      console.warn('Final sync before logout failed', e);
    }
  } catch (e) {
    // ignore if syncManager can't be required
  }

  await wipeLocalDatabase();
};

export const deleteAccount = async () => {
  // Delete remote user and their entries if NEON_URL is configured
  const NEON_URL = resolveNeonUrl();
  const session = await getSession();
  if (!session) throw new Error('No session');
  let remoteDeleted = 0;
  let userDeleted = 0;

  if (NEON_URL) {
    try {
      // delete remote entries then user and count rows
      try {
        const res = await query('DELETE FROM cash_entries WHERE user_id = $1 RETURNING id', [
          session.id,
        ]);
        if (res && Array.isArray(res)) remoteDeleted = res.length;
      } catch (err) {
        console.warn('Failed to delete remote entries', err);
      }

      try {
        const ures = await query('DELETE FROM users WHERE id = $1 RETURNING id', [session.id]);
        if (ures && Array.isArray(ures)) userDeleted = ures.length;
      } catch (err) {
        console.warn('Failed to delete remote user', err);
      }
    } catch (err) {
      console.warn('Failed to delete remote user data', err);
      // continue to clear local data anyway
    }
  }

  // Clear local DB
  await wipeLocalDatabase();
  return { remoteDeleted, userDeleted };
};

export const updateProfile = async (updates: { name?: string; email?: string }) => {
  const NEON_URL = resolveNeonUrl();
  const session = await getSession();
  if (!session) throw new Error('No session');

  // If remote available, try to update remote when online; otherwise queue update locally
  if (NEON_URL) {
    const online = await isOnline();
    if (!online) {
      // queue pending update locally for later sync
      try {
        await addPendingProfileUpdate(session.id, updates);
      } catch (e) {
        console.warn('Failed to queue pending profile update locally', e);
      }
      // update local session so UI reflects changes immediately
      const newName = updates.name !== undefined ? updates.name : session.name;
      const newEmail = updates.email !== undefined ? updates.email : session.email;
      await saveSession(session.id, newName || '', newEmail || '');
      return { id: session.id, name: newName, email: newEmail, queued: true };
    }

    // if email is changing, ensure uniqueness
    if (updates.email && updates.email !== session.email) {
      // check uniqueness with timeout
      const existing = await withTimeout(
        query('SELECT id FROM users WHERE email = $1', [updates.email]),
        6000
      );
      if (existing && existing.length > 0) throw new Error('Email already in use');
    }

    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      params.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push(`email = $${idx++}`);
      params.push(updates.email);
    }
    if (fields.length > 0) {
      params.push(session.id);
      const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, name, email`;
      const res = await query(sql, params);
      if (res && res.length) {
        const user = res[0];
        await saveSession(user.id, user.name || '', user.email);
        return user;
      }
    }
  }

  // Fallback: update local-only session
  const newName = updates.name !== undefined ? updates.name : session.name;
  const newEmail = updates.email !== undefined ? updates.email : session.email;
  await saveSession(session.id, newName || '', newEmail || '');
  return { id: session.id, name: newName, email: newEmail };
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const NEON_URL = resolveNeonUrl();
  const session = await getSession();
  if (!session) throw new Error('No session');

  if (!NEON_URL) throw new Error('Online required to change password');
  const online = await isOnline();
  if (!online) throw new Error('Online required to change password');
  // try to fail fast if DB is slow
  const res = await withTimeout(
    query('SELECT password_hash FROM users WHERE id = $1', [session.id]),
    8000
  );
  if (!res || res.length === 0) throw new Error('User not found');
  const userRow = res[0];
  const match = await bcrypt.compare(currentPassword, userRow.password_hash);
  if (!match) throw new Error('Current password is incorrect');

  // Basic password strength check (min 8 chars, contains digit)
  if (typeof newPassword !== 'string' || newPassword.length < 8 || !/[0-9]/.test(newPassword)) {
    throw new Error('Password must be at least 8 characters and include a number');
  }

  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(newPassword, salt);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, session.id]);
  return true;
};
