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
const prepareOfflineWorkspace = async (_userId: string) => {
  // Offline workspace is disabled. App requires online NeonDB/Clerk.
  return;
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
  // 1. Stop background sync and background fetch to avoid races
  try {
    const sync = require('./syncManager');
    if (sync && typeof sync.stopAutoSyncListener === 'function') {
      try {
        sync.stopAutoSyncListener();
      } catch (e) {}
    }
    if (sync && typeof sync.stopForegroundSyncScheduler === 'function') {
      try {
        sync.stopForegroundSyncScheduler();
      } catch (e) {}
    }
    if (sync && typeof sync.stopBackgroundFetch === 'function') {
      try {
        await Promise.resolve(sync.stopBackgroundFetch()).catch(() => {});
      } catch (e) {}
    }
    // Try a quick final sync but do not block logout on failure
    try {
      const { syncBothWays } = sync;
      await withTimeout(syncBothWays(), 3000).catch(() => {});
    } catch (e) {}
  } catch (e) {}

  // 2. Wipe local DB and app caches
  try {
    await wipeLocalDatabase();
  } catch (e) {}
  try {
    await clearAllData();
  } catch (e) {}

  // 3. Clear AsyncStorage completely (last_sync_at, last_sync_count, session keys, etc.)
  try {
    await AsyncStorage.clear();
  } catch (e) {
    try {
      await AsyncStorage.removeItem('FALLBACK_SESSION');
      await AsyncStorage.removeItem('last_sync_at');
      await AsyncStorage.removeItem('last_sync_count');
    } catch (ee) {}
  }

  // 4. Notify app to refresh UI/state
  try {
    const { notifyEntriesChanged } = require('../utils/dbEvents');
    notifyEntriesChanged();
  } catch (e) {}
  try {
    const { notifySessionChanged } = require('../utils/sessionEvents');
    await notifySessionChanged();
  } catch (e) {}

  // 5. Remove any explicit fallback session key
  try {
    await AsyncStorage.removeItem('FALLBACK_SESSION');
  } catch (e) {}
  // 6. Sign out from Clerk (best-effort)
  try {
    const clerk = require('@clerk/clerk-expo');
    if (clerk && typeof clerk.signOut === 'function') {
      try {
        await clerk.signOut();
      } catch (e) {}
    } else if (clerk && typeof clerk.useAuth === 'function') {
      try {
        const ca = clerk.useAuth();
        if (ca && typeof ca.signOut === 'function') await ca.signOut();
      } catch (e) {}
    }
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

  // Attempt to delete user from Clerk as well (best-effort).
  try {
    // Try to require Clerk SDK and delete user if a delete API is available.
    const clerk = require('@clerk/clerk-expo');
    // Some Clerk SDKs expose a `User` object with a `delete` method when used in secure contexts.
    const maybeUser = (clerk && (clerk.useUser ? clerk.useUser() : null)) || null;
    if (maybeUser && typeof maybeUser.user?.delete === 'function') {
      try {
        await maybeUser.user.delete();
      } catch (e) {
        console.warn('[Auth] Clerk user delete failed (client-side)', e);
      }
    } else if (clerk && typeof clerk.signOut === 'function') {
      // At minimum sign the user out of Clerk.
      try {
        await clerk.signOut();
      } catch (e) {}
    }
  } catch (e) {
    // Likely not running in an environment where Clerk admin APIs are available.
    console.warn('[Auth] Clerk deletion not performed (needs server-side API)', e);
  }

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

/**
 * Update profile both in Clerk (if available) and Neon. Caller can pass a
 * Clerk user object (from `useUser()`) for client-side update; if absent,
 * only Neon will be updated.
 */
export const updateProfileWithClerk = async (opts: {
  clerkUser?: any;
  updates: { name?: string; email?: string };
}) => {
  const { clerkUser, updates } = opts;

  // 1. If Clerk user object is provided, update Clerk first (best-effort)
  if (clerkUser && typeof clerkUser.update === 'function') {
    try {
      if (updates.name !== undefined) {
        const parts = (updates.name || '').trim().split(/\s+/);
        const firstName = parts[0] || updates.name || '';
        const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
        await clerkUser.update({ firstName, lastName });
      }
      if (updates.email !== undefined) {
        try {
          await clerkUser.update({ emailAddress: updates.email });
        } catch (e) {
          // Some Clerk SDKs require email verification flows; ignore here and proceed
        }
      }
    } catch (e) {
      console.warn('[Auth] Clerk profile update failed', e);
    }
  }

  // 2. Persist to Neon via existing helper (this will save local session)
  return await updateProfile(updates);
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
