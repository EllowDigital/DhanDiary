import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
// NOTE: Ensure 'react-native-get-random-values' is imported in your App.tsx or index.js for uuid to work.

import { query } from '../api/neonClient';
import { saveSession, getSession } from '../db/session';
import {
  addPendingProfileUpdate,
  clearAllData,
  wipeLocalDatabase,
} from '../db/localDb';

// --- Types ---

export interface UserSession {
  id: string;
  name: string;
  email: string;
}

export interface AuthResult {
  id: string;
  name: string;
  email: string;
  isOfflineOnly?: boolean;
}

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
}

// --- Configuration & Helpers ---

const NEON_WARM_CACHE_MS = 60_000;
const TIMEOUT_DEFAULT_MS = 15_000;

const resolveNeonUrl = (): string | null => {
  const extra = Constants.expoConfig?.extra as Record<string, any> | undefined;
  return extra?.NEON_URL || process.env.NEON_URL || null;
};

/**
 * Helper to fail fast on slow network operations.
 */
const withTimeout = <T>(p: Promise<T>, ms = TIMEOUT_DEFAULT_MS): Promise<T> => {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
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
    const timeoutMs = opts.timeoutMs ?? TIMEOUT_DEFAULT_MS;
    neonWarmPromise = withTimeout(query('SELECT 1'), timeoutMs)
      .then(() => {
        lastNeonWarm = Date.now();
        return true;
      })
      .catch((err) => {
        console.warn('[Auth] Neon warm-up failed:', err?.message || err);
        return false;
      })
      .finally(() => {
        neonWarmPromise = null;
      });
  }

  return (await neonWarmPromise) ?? false;
};

// --- Workspace Management ---

const prepareOfflineWorkspace = async (_userId: string) => {
  // Offline workspace preparation logic can go here if needed in the future.
  return;
};

// --- Auth Functions ---

export const registerOnline = async (
  name: string,
  email: string,
  password: string
): Promise<AuthResult> => {
  const NEON_URL = resolveNeonUrl();

  // 1. Offline Mode / No Backend
  if (!NEON_URL) {
    console.log('[Auth] No NEON_URL, registering locally');
    const id = uuidv4();
    await saveSession(id, name || '', email);
    await prepareOfflineWorkspace(id);
    return { id, name, email, isOfflineOnly: true };
  }

  // 2. Production Mode
  if (!(await isOnline())) {
    throw new Error('Internet connection required for registration');
  }

  // Generate hash on client
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  try {
    const result = await withTimeout(
      query<UserRow>(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name, email, hash]
      ),
      20_000
    );

    if (!result || result.length === 0) throw new Error('Registration failed to return user');

    const user = result[0];
    await saveSession(user.id, user.name || '', user.email);
    await prepareOfflineWorkspace(user.id);
    
    return { id: user.id, name: user.name || '', email: user.email };
  } catch (err: any) {
    if (err?.code === '23505' || err?.message?.includes('unique constraint')) {
      throw new Error('This email is already registered.');
    }
    throw err;
  }
};

export const loginOnline = async (email: string, password: string): Promise<AuthResult> => {
  if (!(await isOnline())) {
    throw new Error('Internet connection required for login');
  }

  const result = await withTimeout(
    query<UserRow>('SELECT id, name, email, password_hash FROM users WHERE email = $1 LIMIT 1', [email]),
    20_000
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

  return { id: user.id, name: user.name || '', email: user.email };
};

export const logout = async (): Promise<boolean> => {
  // Helper to safely run a promise without throwing
  const safeRun = async (fn: () => Promise<any> | any) => {
    try {
      await fn();
    } catch (e) {
      // Ignore cleanup errors
    }
  };

  // 1. Stop background sync and fetch (Dynamic requires to avoid circular deps)
  await safeRun(async () => {
    const sync = require('./syncManager'); // Ensure this path matches your file structure
    if (sync) {
      if (typeof sync.stopAutoSyncListener === 'function') sync.stopAutoSyncListener();
      if (typeof sync.stopForegroundSyncScheduler === 'function') sync.stopForegroundSyncScheduler();
      if (typeof sync.stopBackgroundFetch === 'function') await sync.stopBackgroundFetch();
      
      // Attempt a final quick sync, don't wait too long
      if (typeof sync.syncBothWays === 'function') {
        await withTimeout(sync.syncBothWays(), 3000).catch(() => {});
      }
    }
  });

  // 2. Wipe Local Data
  await safeRun(wipeLocalDatabase);
  await safeRun(clearAllData);

  // 3. Clear Storage
  try {
    await AsyncStorage.clear();
  } catch (e) {
    // Fallback if clear fails
    await safeRun(() => AsyncStorage.removeItem('FALLBACK_SESSION'));
    await safeRun(() => AsyncStorage.removeItem('last_sync_at'));
    await safeRun(() => AsyncStorage.removeItem('last_sync_count'));
  }

  // 4. Notify UI
  await safeRun(() => {
    const { notifyEntriesChanged } = require('../utils/dbEvents');
    notifyEntriesChanged();
  });
  
  await safeRun(async () => {
    const { notifySessionChanged } = require('../utils/sessionEvents');
    await notifySessionChanged();
  });

  // 5. Sign out from Clerk (Best Effort)
  await safeRun(async () => {
    const clerk = require('@clerk/clerk-expo');
    if (clerk) {
      if (typeof clerk.signOut === 'function') {
        await clerk.signOut();
      } else if (typeof clerk.useAuth === 'function') {
        // useAuth() is a hook, cannot be used here outside a component.
        // We rely on direct signOut or the AuthContext reference if stored elsewhere.
        console.warn('[Auth] Cannot use hook inside logout function. Ensure Clerk handles token storage clearing automatically.');
      }
    }
  });

  // 6. Clear React Query Cache
  await safeRun(async () => {
    const holder = require('../utils/queryClientHolder');
    if (holder && typeof holder.clearQueryCache === 'function') {
      await holder.clearQueryCache();
    }
  });

  return true;
};

export const deleteAccount = async () => {
  const NEON_URL = resolveNeonUrl();
  const session = await getSession();
  
  if (!session) throw new Error('No active session found');
  
  let remoteDeleted = 0;
  let userDeleted = 0;

  // 1. Remote Deletion (if online and configured)
  if (NEON_URL) {
    try {
      // Delete dependent entries first
      const entriesRes = await withTimeout(
        query('DELETE FROM cash_entries WHERE user_id = $1 RETURNING id', [session.id]),
        10_000
      );
      if (entriesRes && Array.isArray(entriesRes)) remoteDeleted = entriesRes.length;

      // Delete user record
      const userRes = await withTimeout(
        query('DELETE FROM users WHERE id = $1 RETURNING id', [session.id]),
        10_000
      );
      if (userRes && Array.isArray(userRes)) userDeleted = userRes.length;

    } catch (err) {
      console.warn('[Auth] Failed to connect or delete remote account:', err);
      // Proceed to wipe local data anyway
    }
  }

  // 2. Wipe Local Data
  await wipeLocalDatabase();

  // 3. Clerk Deletion (Best Effort)
  try {
    const clerk = require('@clerk/clerk-expo');
    if (clerk && typeof clerk.signOut === 'function') {
      await clerk.signOut();
    }
    // Note: Actual user deletion usually requires a backend API call to Clerk 
    // rather than a client-side call, unless using useUser().delete().
  } catch (e) {
    console.warn('[Auth] Clerk clean up failed', e);
  }

  return { remoteDeleted, userDeleted };
};

export const updateProfile = async (updates: { name?: string; email?: string }) => {
  const NEON_URL = resolveNeonUrl();
  const session = await getSession();
  if (!session) throw new Error('No active session');

  const newName = updates.name !== undefined ? updates.name : session.name;
  const newEmail = updates.email !== undefined ? updates.email : session.email;

  // 1. Offline Handling
  const online = await isOnline();
  if (!NEON_URL || !online) {
    if (NEON_URL) {
      // Online configured but currently offline -> Queue it
      try {
        await addPendingProfileUpdate(session.id, updates);
      } catch (e) {
        console.warn('[Auth] Failed to queue pending profile update', e);
      }
    }
    // Apply locally immediately
    await saveSession(session.id, newName || '', newEmail || '');
    return { id: session.id, name: newName, email: newEmail, queued: !online };
  }

  // 2. Online Handling
  // Check for email collision if email is changing
  if (updates.email && updates.email !== session.email) {
    const existing = await withTimeout(
      query('SELECT id FROM users WHERE email = $1 AND id != $2 LIMIT 1', [
        updates.email,
        session.id,
      ]),
      6_000
    );
    if (existing && existing.length > 0) throw new Error('Email already in use');
  }

  // Construct Dynamic SQL
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

    const res = await query<UserRow>(sql, params);
    if (res && res.length) {
      const user = res[0];
      await saveSession(user.id, user.name || '', user.email);
      return { id: user.id, name: user.name, email: user.email };
    }
  }

  // Fallback (no fields changed or update failed silently)
  return { id: session.id, name: newName, email: newEmail };
};

export const updateProfileWithClerk = async (opts: {
  clerkUser?: any; // Keeping any to avoid strict dependency on Clerk types if not installed
  updates: { name?: string; email?: string };
}) => {
  const { clerkUser, updates } = opts;

  // 1. Update Clerk (Best Effort)
  if (clerkUser && typeof clerkUser.update === 'function') {
    try {
      const updatePayload: any = {};
      
      if (updates.name !== undefined) {
        const parts = (updates.name || '').trim().split(/\s+/);
        updatePayload.firstName = parts[0] || updates.name || '';
        updatePayload.lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
      }
      
      // Updating email in Clerk usually requires a verification flow.
      // We attempt it here, but it might throw if not verified.
      if (updates.email !== undefined) {
         // This is highly dependent on Clerk configuration (strict vs loose)
         // updatePayload.emailAddress = updates.email; 
      }

      if (Object.keys(updatePayload).length > 0) {
        await clerkUser.update(updatePayload);
      }
    } catch (e) {
      console.warn('[Auth] Clerk profile update failed:', e);
      // We continue to update Neon/Local even if Clerk fails to keep app usable
    }
  }

  // 2. Persist to Neon & Local
  return await updateProfile(updates);
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
  const NEON_URL = resolveNeonUrl();
  if (!NEON_URL) throw new Error('Cannot change password in offline-only mode');

  const session = await getSession();
  if (!session) throw new Error('No active session');

  if (!(await isOnline())) {
    throw new Error('Online connection required to change password');
  }

  // Verify current password
  const res = await withTimeout(
    query<UserRow>('SELECT password_hash FROM users WHERE id = $1', [session.id]),
    8_000
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