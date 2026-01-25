/**
 * Session Recovery Service
 *
 * Handles robust session recovery when Clerk or network issues occur.
 * Ensures users don't get forced to re-authenticate unnecessarily.
 */

import { getSession, saveSession } from '../db/session';
import { query } from '../api/neonClient';
import { isUuid } from '../utils/uuid';
import NetInfo from '@react-native-community/netinfo';

export interface SessionRecoveryResult {
  success: boolean;
  reason: string;
  user?: { id: string; name: string; email: string; clerk_id?: string | null };
  isOfflineOnly?: boolean;
}

/**
 * Attempts to recover a valid session when Clerk is unavailable or connection is lost.
 * This is the primary recovery mechanism to prevent "session expired" false positives.
 */
export const recoverSessionGracefully = async (): Promise<SessionRecoveryResult> => {
  try {
    const storedSession = await getSession();

    if (!storedSession || !storedSession.id) {
      return {
        success: false,
        reason: 'no_stored_session',
      };
    }

    // Check connectivity
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        // Offline: use stored session as-is
        if (__DEV__) console.info('[SessionRecovery] Offline; using stored session');
        return {
          success: true,
          reason: 'offline_fallback',
          user: storedSession as any,
          isOfflineOnly: true,
        };
      }
    } catch (e) {
      // NetInfo failed; assume offline and use stored session
      if (__DEV__) console.warn('[SessionRecovery] NetInfo failed; assuming offline');
      return {
        success: true,
        reason: 'netinfo_check_failed',
        user: storedSession as any,
        isOfflineOnly: true,
      };
    }

    // Online: try to refresh profile from server
    try {
      const rows = await query(
        'SELECT id, name, email, clerk_id FROM users WHERE id = $1 LIMIT 1',
        [storedSession.id]
      );

      if (rows && rows.length > 0) {
        const user = rows[0];
        // Update stored session with fresh data
        try {
          await saveSession(
            user.id,
            user.name || '',
            user.email || '',
            storedSession.image ?? null,
            storedSession.imageUrl ?? null,
            user.clerk_id ?? storedSession.clerk_id ?? null
          );
        } catch (e) {
          if (__DEV__) console.warn('[SessionRecovery] Failed to update session', e);
        }

        return {
          success: true,
          reason: 'server_refresh_success',
          user: {
            id: user.id,
            name: user.name || '',
            email: user.email || '',
            clerk_id: user.clerk_id ?? storedSession.clerk_id ?? null,
          },
          isOfflineOnly: false,
        };
      } else if (storedSession.clerk_id) {
        // UUID not found on server, but we have a Clerk ID. Try resolving by Clerk ID.
        try {
          const byClerk = await query(
            'SELECT id, name, email, clerk_id FROM users WHERE clerk_id = $1 LIMIT 1',
            [storedSession.clerk_id]
          );

          if (byClerk && byClerk.length > 0) {
            const user = byClerk[0];
            // Update stored session with correct UUID
            try {
              await saveSession(
                user.id,
                user.name || '',
                user.email || '',
                storedSession.image ?? null,
                storedSession.imageUrl ?? null,
                user.clerk_id ?? storedSession.clerk_id ?? null
              );
            } catch (e) {
              if (__DEV__)
                console.warn('[SessionRecovery] Failed to update session via clerk_id', e);
            }

            return {
              success: true,
              reason: 'server_refresh_by_clerk_id',
              user: {
                id: user.id,
                name: user.name || '',
                email: user.email || '',
                clerk_id: user.clerk_id ?? storedSession.clerk_id ?? null,
              },
              isOfflineOnly: false,
            };
          }
        } catch (e) {
          if (__DEV__) console.warn('[SessionRecovery] Clerk ID lookup failed', e);
        }
      }

      // Server lookup failed but we have a valid stored session; use it offline-style
      if (__DEV__) console.warn('[SessionRecovery] Server lookup failed; using stored session');
      return {
        success: true,
        reason: 'server_lookup_failed_fallback',
        user: storedSession as any,
        isOfflineOnly: true,
      };
    } catch (e) {
      if (__DEV__) console.error('[SessionRecovery] Query failed', e);
      // Network error; fall back to stored session
      return {
        success: true,
        reason: 'query_error_fallback',
        user: storedSession as any,
        isOfflineOnly: true,
      };
    }
  } catch (e) {
    if (__DEV__) console.error('[SessionRecovery] Fatal recovery error', e);
    return {
      success: false,
      reason: 'fatal_error',
    };
  }
};

/**
 * Validates if the current stored session is still valid.
 * Returns false only if:
 * 1. No session exists, OR
 * 2. Session UUID is invalid
 */
export const isSessionValid = async (): Promise<boolean> => {
  try {
    const session = await getSession();
    if (!session || !session.id) return false;
    return isUuid(session.id);
  } catch (e) {
    return false;
  }
};

/**
 * Safely checks if a session should be considered "expired" based on:
 * 1. Clerk auth state vs local session
 * 2. Network connectivity
 * 3. Server-side session validity
 */
export const shouldForceReauth = async (opts: {
  clerkId: string | null;
  clerkLoaded: boolean;
  isOnline: boolean | null;
}): Promise<boolean> => {
  const { clerkId, clerkLoaded, isOnline } = opts;

  try {
    // If Clerk isn't loaded yet, don't make decisions
    if (!clerkLoaded) return false;

    // If we're definitely offline, never force re-auth
    if (isOnline === false) return false;

    // If we're checking connectivity (null), don't force re-auth yet
    if (isOnline === null) return false;

    // If there's no Clerk identity, no need to validate
    const storedSession = await getSession();
    if (!storedSession?.clerk_id) return false;

    // If Clerk ID matches stored session, all good
    if (clerkId && storedSession.clerk_id === String(clerkId)) return false;

    // If Clerk ID doesn't match and we're online, user likely signed out or switched accounts
    // But only force re-auth if we're really confident about the network state
    return isOnline === true;
  } catch (e) {
    if (__DEV__) console.warn('[SessionValidation] Check failed', e);
    return false;
  }
};

export default {
  recoverSessionGracefully,
  isSessionValid,
  shouldForceReauth,
};
