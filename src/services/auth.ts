import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid'; // Ensure uuid is installed: npm install uuid

import { query } from '../api/neonClient';
import { saveSession, getSession } from '../db/session';
import {
  addPendingProfileUpdate,
  clearAllData,
  init as initDb,
  wipeLocalDatabase,
} from '../db/localDb';
import { getOfflineDbOwner, setOfflineDbOwner } from '../db/offlineOwner';
import * as localDb from '../db/localDb';

// --- Types ---

export interface UserSession {
  id: string;
  name: string;
  email: string;
}

interface AuthResult {
  id: string;
  name: string;
  email: string;
  isOfflineOnly?: boolean;
}

// --- Configuration & Helpers ---

const resolveNeonUrl = () =>
  (Constants?.expoConfig?.extra as any)?.NEON_URL || process.env.NEON_URL || null;

/**
 * Helper to fail fast on slow network operations.
 * Important for mobile usage where connections hang.
 */
const withTimeout = <T>(p: Promise<T>, ms = 15000): Promise<T> => {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Request timed out after ${ms}ms`)), ms)
    ),
  ]);
};

export const isOnline = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  return !!state.isConnected && !!state.isInternetReachable;
};

// --- Connection Warming ---

let neonWarmPromise: Promise<boolean> | null = null;
let lastNeonWarm = 0;
const NEON_WARM_CACHE_MS = 60_000;

export const warmNeonConnection = async (opts: { force?: boolean; timeoutMs?: number } = {}) => {
  const NEON_URL = resolveNeonUrl();
  if (!NEON_URL) return false;

  const online = await isOnline();
  if (!online) return false;

  const now = Date.now();
  if (!opts.force && now - lastNeonWarm < NEON_WARM_CACHE_MS && !neonWarmPromise) {
    return true;
  }

  if (!neonWarmPromise) {
    const timeoutMs = opts.timeoutMs ?? 15000;
    neonWarmPromise = withTimeout(query('SELECT 1'), timeoutMs)
      .then(() => {
        lastNeonWarm = Date.now();
        return true;
      })
      .catch((err) => {
        console.warn('[Auth] Neon warm-up failed', err?.message || err);
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

// --- Workspace Management ---

/**
 * Prepares the local database for a specific user.
 * If a different user previously logged in, this wipes their data to prevent leaks.
 */
const prepareOfflineWorkspace = async (userId: string) => {
  await initDb();

  let owner: string | null = null;
  try {
    owner = await getOfflineDbOwner();
  } catch (e) {
    // If table doesn't exist yet, ignore
    owner = null;
  }

  // Security: If the DB belongs to someone else, wipe it clean.
  if (owner && owner !== userId) {
    console.log('[Auth] Detected user switch. Wiping previous user data.');
    await clearAllData({ includeSession: false });
  }

  // Claim ownership
  if (owner !== userId) {
    await setOfflineDbOwner(userId);
  }

  // Check if we need to trigger an initial sync
  let hasExistingData = false;
  try {
    const existing = await localDb.getEntries(userId);
    hasExistingData = Array.isArray(existing) && existing.length > 0;
  } catch (e) {
    hasExistingData = false;
  }

  if (!hasExistingData) {
    // Trigger background sync to pull remote data
    // We use require() here to avoid circular dependency loops with syncManager
    try {
      const { syncBothWays } = require('./syncManager');
      setTimeout(() => {
        syncBothWays().catch((e: any) => console.warn('[Auth] Background initial sync failed', e));
      }, 100);
    } catch (e) {
      console.warn('[Auth] Could not load syncManager for initial sync');
    }
  }
};

// --- Auth Functions ---

export const registerOnline = async (
  name: string,
  email: string,
  password: string
): Promise<AuthResult> => {
  const NEON_URL = resolveNeonUrl();

  // 1. Dev/Offline Mode: If no URL, create local session
  if (!NEON_URL) {
    console.log('[Auth] No NEON_URL, registering locally');
    const id = uuidv4();
    await saveSession(id, name || '', email);
    await prepareOfflineWorkspace(id);
    return { id, name, email, isOfflineOnly: true };
  }

  // 2. Production Mode
  const online = await isOnline();
  if (!online) throw new Error('Internet connection required for registration');

  // Generate hash on client (Direct-to-DB architecture)
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  try {
    const result = await withTimeout(
      query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name, email, hash]
      ),
      20000
    );

    if (!result || result.length === 0) throw new Error('Registration failed to return user');

    const user = result[0];
    await saveSession(user.id, user.name || '', user.email);
    await prepareOfflineWorkspace(user.id);
    return { id: user.id, name: user.name, email: user.email };
  } catch (err: any) {
    if (err?.code === '23505' || err?.message?.includes('unique constraint')) {
      throw new Error('This email is already registered.');
    }
    throw err;
  }
};

export const loginOnline = async (email: string, password: string): Promise<AuthResult> => {
  const online = await isOnline();
  if (!online) throw new Error('Internet connection required for login');

  // Select only necessary fields for speed and security
  const result = await withTimeout(
    query('SELECT id, name, email, password_hash FROM users WHERE email = $1 LIMIT 1', [email]),
    20000
  );

  if (!result || result.length === 0) {
    throw new Error('User not found');
  }

  const user = result[0];
  const match = await bcrypt.compare(password, user.password_hash);

  if (!match) {
    throw new Error('Invalid password');
  }

  await saveSession(user.id, user.name || '', user.email);
  await prepareOfflineWorkspace(user.id);

  return { id: user.id, name: user.name, email: user.email };
};

export const logout = async () => {
  // 1. Attempt one last sync to save data
  try {
    const { syncBothWays } = require('./syncManager');
    await withTimeout(syncBothWays(), 5000).catch(() => {});
  } catch (e) {
    // Ignore sync errors on logout
  }

  // 2. Wipe data
  await wipeLocalDatabase();

  // 3. Clear any backup session flags
  try {
    await AsyncStorage.removeItem('FALLBACK_SESSION');
  } catch (e) {}
};

export const deleteAccount = async () => {
  const NEON_URL = resolveNeonUrl();
  const session = await getSession();
  if (!session) throw new Error('No active session found');

  let remoteDeleted = 0;
  let userDeleted = 0;

  // Try to delete remote data if online
  if (NEON_URL) {
    try {
      // Delete entries first (FK constraint)
      try {
        const res = await withTimeout(
          query('DELETE FROM cash_entries WHERE user_id = $1 RETURNING id', [session.id]),
          10000
        );
        if (res && Array.isArray(res)) remoteDeleted = res.length;
      } catch (err) {
        console.warn('[Auth] Failed to delete remote entries', err);
      }

      // Delete user
      try {
        const ures = await withTimeout(
          query('DELETE FROM users WHERE id = $1 RETURNING id', [session.id]),
          10000
        );
        if (ures && Array.isArray(ures)) userDeleted = ures.length;
      } catch (err) {
        console.warn('[Auth] Failed to delete remote user', err);
      }
    } catch (err) {
      console.warn('[Auth] Failed to connect to delete remote account', err);
    }
  }

  // Always wipe local data regardless of remote success
  await wipeLocalDatabase();
  return { remoteDeleted, userDeleted };
};

export const updateProfile = async (updates: { name?: string; email?: string }) => {
  const NEON_URL = resolveNeonUrl();
  const session = await getSession();
  if (!session) throw new Error('No active session');

  const newName = updates.name !== undefined ? updates.name : session.name;
  const newEmail = updates.email !== undefined ? updates.email : session.email;

  // 1. Offline or No-Backend Mode: Update locally
  const online = await isOnline();
  if (!NEON_URL || !online) {
    if (NEON_URL) {
      // If we have a backend but are offline, queue the update
      try {
        await addPendingProfileUpdate(session.id, updates);
      } catch (e) {
        console.warn('[Auth] Failed to queue pending profile update', e);
      }
    }
    // Apply locally
    await saveSession(session.id, newName || '', newEmail || '');
    return { id: session.id, name: newName, email: newEmail, queued: !online };
  }

  // 2. Online Mode
  if (updates.email && updates.email !== session.email) {
    const existing = await withTimeout(
      query('SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1', [
        updates.email,
        session.id,
      ]),
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

  // Fallback (no fields changed)
  return { id: session.id, name: newName, email: newEmail };
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const NEON_URL = resolveNeonUrl();
  if (!NEON_URL) throw new Error('Cannot change password in offline-only mode');

  const session = await getSession();
  if (!session) throw new Error('No active session');

  const online = await isOnline();
  if (!online) throw new Error('Online connection required to change password');

  // Verify current password
  const res = await withTimeout(
    query('SELECT password_hash FROM users WHERE id = $1', [session.id]),
    8000
  );

  if (!res || res.length === 0) throw new Error('User record not found');

  const userRow = res[0];
  const match = await bcrypt.compare(currentPassword, userRow.password_hash);
  if (!match) throw new Error('Current password is incorrect');

  // Validate new password
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // Update
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(newPassword, salt);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, session.id]);

  return true;
};
