import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import bcrypt from 'bcryptjs';
import { uuidv4, isUuid } from '../utils/uuid';
// NOTE: Ensure 'react-native-get-random-values' is imported in your App.tsx or index.js for uuid to work.

import { query } from '../api/neonClient';
import { saveSession, getSession } from '../db/session';
import { addPendingProfileUpdate, clearAllData, wipeLocalDatabase } from '../db/localDb';

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
    // Ensure guest-mode is cleared on successful registration so app can create
    // normal sessions going forward.
    try {
      const sessMod = require('../db/session');
      if (sessMod && typeof sessMod.setNoGuestMode === 'function') {
        await sessMod.setNoGuestMode(false);
        // Clear any account-deleted marker when user registers
        if (typeof sessMod.setAccountDeletedAt === 'function') {
          await sessMod.setAccountDeletedAt(null);
        }
      }
    } catch (e) {}
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
    query<UserRow>('SELECT id, name, email, password_hash FROM users WHERE email = $1 LIMIT 1', [
      email,
    ]),
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
  // Clear no-guest flag when a user successfully logs in so guest creation is allowed
  // again in case the user logs out later.
  try {
    const sessMod = require('../db/session');
    if (sessMod && typeof sessMod.setNoGuestMode === 'function') {
      await sessMod.setNoGuestMode(false);
      // Clear any account-deleted marker when user logs in
      if (typeof sessMod.setAccountDeletedAt === 'function') {
        await sessMod.setAccountDeletedAt(null);
      }
    }
  } catch (e) {}
  await prepareOfflineWorkspace(user.id);

  return { id: user.id, name: user.name || '', email: user.email };
};

export const logout = async (opts?: {
  /**
   * When true, performs a heavier "reset" cleanup (clears AsyncStorage and local wrapper storage).
   * Default: false (fast sign-out; removes only auth/sync-critical keys).
   */
  clearAllStorage?: boolean;

  /**
   * Optional dependency injection for Clerk signOut.
   * Prefer using performHardSignOut() from UI layers; this is a fallback for
   * non-hook contexts that still want to ensure Clerk is signed out.
   */
  clerkSignOut?: () => Promise<any>;
}): Promise<boolean> => {
  const clearAllStorage = Boolean(opts?.clearAllStorage);

  const safeRun = async (fn: () => Promise<any> | any) => {
    try {
      await fn();
    } catch (e) {
      // best-effort cleanup: ignore
    }
  };

  // 0) Cancel sync immediately (don’t wait) to keep UI responsive.
  try {
    const sync = require('./syncManager');
    if (sync) {
      if (typeof sync.cancelSyncWork === 'function') sync.cancelSyncWork();
    }
  } catch (e) {}

  // 1) Stop background sync & listeners (best-effort, but we do await to reduce races).
  await safeRun(async () => {
    const sync = require('./syncManager');
    if (!sync) return;
    if (typeof sync.stopSyncEngine === 'function') {
      await sync.stopSyncEngine();
      return;
    }
    if (typeof sync.stopAutoSyncListener === 'function') sync.stopAutoSyncListener();
    if (typeof sync.stopForegroundSyncScheduler === 'function') sync.stopForegroundSyncScheduler();
    if (typeof sync.stopBackgroundFetch === 'function') await sync.stopBackgroundFetch();
  });

  // 2) Clear local DB + persisted session FIRST (critical for sign-out correctness).
  // wipeLocalDatabase is already best-effort internally; we still treat failure as non-fatal.
  let wipedOk = true;
  try {
    const res: any = await wipeLocalDatabase();
    if (res && typeof res.ok === 'boolean' && res.ok === false) wipedOk = false;
  } catch (e) {
    wipedOk = false;
  }

  // Re-create local tables after wipe so any in-flight queries (e.g., useEntries)
  // don't hit "no such table" during logout/navigation transitions.
  await safeRun(async () => {
    const { initDB } = await import('../db/sqlite');
    if (typeof initDB === 'function') await initDB();
  });

  // 3) Storage cleanup
  if (clearAllStorage) {
    // Heavy reset mode (used by "Reset Application").
    await safeRun(clearAllData);
    await safeRun(async () => {
      await AsyncStorage.clear();
    });
  } else {
    // Fast sign-out mode: remove only auth/sync-critical keys.
    const keysToRemove = [
      'FALLBACK_SESSION',
      'ACCOUNT_DELETED_AT',
      'offline_db_owner_v1',
      'last_sync_at',
      'last_sync_count',
      'sync_paused_v1',
    ];
    await safeRun(async () => {
      if (typeof (AsyncStorage as any).multiRemove === 'function') {
        await (AsyncStorage as any).multiRemove(keysToRemove);
      } else {
        for (const k of keysToRemove) await AsyncStorage.removeItem(k);
      }
    });
  }

  // 4) Notify UI
  await safeRun(() => {
    const { notifyEntriesChanged } = require('../utils/dbEvents');
    notifyEntriesChanged();
  });

  await safeRun(async () => {
    const { notifySessionChanged } = require('../utils/sessionEvents');
    await notifySessionChanged();
  });

  // 5) Clear React Query Cache
  await safeRun(async () => {
    const holder = require('../utils/queryClientHolder');
    if (holder && typeof holder.clearQueryCache === 'function') {
      await holder.clearQueryCache();
    }
  });

  // 6) Best-effort Clerk sign-out (to avoid leaving an auth session active)
  // NOTE: In most UI flows we use performHardSignOut() with useAuth().signOut.
  if (typeof opts?.clerkSignOut === 'function') {
    await safeRun(async () => {
      await opts.clerkSignOut!();
    });
  } else {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[Auth] logout() called without clerkSignOut; prefer performHardSignOut() from UI layers'
      );
    }
    await safeRun(async () => {
      try {
        const mod = require('@clerk/clerk-expo');
        const clerk = (mod && (mod.clerk || mod.default || mod)) as any;
        if (clerk && typeof clerk.signOut === 'function') {
          await clerk.signOut();
        }
      } catch (e) {
        // ignore
      }
    });
  }

  return wipedOk;
};

export const deleteAccount = async (opts?: { clerkUserId?: string }) => {
  const NEON_URL = resolveNeonUrl();
  const session = await getSession();

  if (!session) throw new Error('No active session found');

  let remoteDeleted = 0;
  let userDeleted = 0;
  let clerkDeleted = false;

  // 1. Remote Deletion (if online and configured)
  if (NEON_URL) {
    try {
      // If the session id is not a UUID (e.g. guest_xxx created for offline-only users),
      // skip remote deletion — Postgres uuid columns will reject non-UUID input.
      const uuidOk = typeof session.id === 'string' && isUuid(session.id);
      if (!uuidOk) {
        console.info('[Auth] Skipping remote Neon deletion for non-UUID session id', session.id);
      } else {
        try {
          // Delete dependent entries first
          const entriesRes = await withTimeout(
            query('DELETE FROM transactions WHERE user_id = $1 RETURNING id', [session.id]),
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
    } catch (err) {
      console.warn('[Auth] Failed to connect or delete remote account:', err);
      // Proceed to wipe local data anyway
    }
  }

  // 2. Clerk Deletion (best-effort; prefer backend endpoint)
  try {
    // Prefer calling a backend delete endpoint (recommended). If your app
    // configures `CLERK_DELETE_URL` (in expo extra or env), we'll POST to it
    // with the clerk user id. The backend should authenticate the request and
    // call Clerk Admin API server-side.
    const BACKEND_DELETE_URL =
      (Constants.expoConfig && (Constants.expoConfig.extra as any)?.CLERK_DELETE_URL) ||
      process.env.CLERK_DELETE_URL ||
      null;

    if (opts?.clerkUserId && BACKEND_DELETE_URL) {
      try {
        await withTimeout(
          fetch(BACKEND_DELETE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: opts.clerkUserId }),
          }),
          10000
        );
        clerkDeleted = true;
      } catch (e) {
        console.warn('[Auth] backend clerk delete failed', (e as any)?.message || e);
      }
    } else {
      // No backend URL — fall back to best-effort client-side admin call only
      // if a CLERK_SECRET is present (NOT recommended). Warn in dev.
      const clerkSecret =
        Constants.expoConfig?.extra?.CLERK_SECRET || process.env.CLERK_SECRET || null;

      if (clerkSecret && opts?.clerkUserId) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(
            '[Auth] WARNING: CLERK_SECRET is present in client config. Storing or shipping admin secrets in a mobile client is insecure. Prefer a server endpoint.'
          );
        }
        try {
          const url = `https://api.clerk.com/v1/users/${opts.clerkUserId}`;
          await withTimeout(
            fetch(url, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${clerkSecret}` },
            }),
            10000
          );
          clerkDeleted = true;
        } catch (e) {
          console.warn('[Auth] Clerk admin delete failed', (e as any)?.message || e);
        }
      }
    }
  } catch (e) {
    console.warn('[Auth] Clerk clean up failed', (e as any)?.message || e);
  }

  const deletionInfo = {
    timestamp: new Date().toISOString(),
    remoteDeleted,
    userDeleted,
  };

  // Emit analytics event if analytics helper available (best-effort)
  try {
    // Attempt to require a project analytics helper if present
    const analytics = require('../utils/analytics');
    if (analytics && typeof analytics.trackEvent === 'function') {
      try {
        analytics.trackEvent('account_deleted', deletionInfo);
      } catch (aErr) {
        console.warn('[Auth] analytics.trackEvent failed', aErr);
      }
    }
  } catch (e) {
    // No analytics util — fall back to console
  }

  // Always log deletion info for server-side ingestion or debugging
  try {
    console.info('[Auth] account deleted', deletionInfo);
  } catch (e) {}

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
