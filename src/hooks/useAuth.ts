import { useState, useEffect } from 'react';
import { getSession, saveSession } from '../db/session';
import { subscribeSession } from '../utils/sessionEvents';
import { query } from '../api/neonClient';
import NetInfo from '@react-native-community/netinfo';
import { isUuid, uuidv4 } from '../utils/uuid';
// Optional Clerk integration: if Clerk is installed and user is signed in,
// prefer Clerk's user as the authoritative session and persist it locally.
let useClerkUser: any = null;
let useClerkAuth: any = null;
try {
  // Require at runtime to avoid breaking builds where Clerk isn't configured
  // and to keep this hook resilient in different environments.
  const clerk = require('@clerk/clerk-expo');
  useClerkUser = clerk.useUser;
  useClerkAuth = clerk.useAuth;
} catch (e) {
  useClerkUser = null;
  useClerkAuth = null;
}

type UserSession = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  imageUrl?: string | null;
};

export const useAuth = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  // If Clerk hooks are available, call them to get immediate clerk identity.
  const clerk = useClerkUser ? useClerkUser() : { user: null, isLoaded: false };
  const clerkAuth = useClerkAuth ? useClerkAuth() : { isSignedIn: false };

  useEffect(() => {
    const load = async () => {
      try {
        const session = await getSession();
        if (session && session.id) {
          // Try to refresh profile from server when online and NEON configured
          try {
            const net = await NetInfo.fetch();
            if (net.isConnected) {
              try {
                const rows = await query(
                  'SELECT id, name, email FROM users WHERE id = $1 LIMIT 1',
                  [session.id]
                );
                if (rows && rows.length) {
                  const u = rows[0];
                  // persist fresh profile locally
                  await saveSession(
                    u.id,
                    u.name || '',
                    u.email || '',
                    (session as any)?.image ?? null,
                    (session as any)?.imageUrl ?? null,
                    (session as any)?.clerk_id ?? null
                  );
                  setUser({
                    id: u.id,
                    name: u.name || '',
                    email: u.email || '',
                    image: (session as any)?.image ?? null,
                    imageUrl: (session as any)?.imageUrl ?? (session as any)?.image ?? null,
                  });
                } else {
                  // If the stored UUID isn't present on the server (offline fallback or migration),
                  // try to resolve by Clerk id (authoritative identity) when available.
                  const clerkId = (session as any)?.clerk_id
                    ? String((session as any).clerk_id)
                    : null;
                  if (clerkId) {
                    try {
                      const byClerk = await query(
                        'SELECT id, name, email FROM users WHERE clerk_id = $1 LIMIT 1',
                        [clerkId]
                      );
                      if (byClerk && byClerk.length) {
                        const u2 = byClerk[0];
                        await saveSession(
                          u2.id,
                          u2.name || '',
                          u2.email || '',
                          (session as any)?.image ?? null,
                          (session as any)?.imageUrl ?? null,
                          clerkId
                        );
                        setUser({
                          id: u2.id,
                          name: u2.name || '',
                          email: u2.email || '',
                          image: (session as any)?.image ?? null,
                          imageUrl: (session as any)?.imageUrl ?? (session as any)?.image ?? null,
                        });
                      } else {
                        setUser(session || null);
                      }
                    } catch (e) {
                      setUser(session || null);
                    }
                  } else {
                    setUser(session || null);
                  }
                }
              } catch (e) {
                // network or query failed — fall back to local session
                setUser(session || null);
              }
            } else {
              setUser(session || null);
            }
          } catch (e) {
            setUser(session || null);
          }
        } else {
          setUser(session || null);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
    // If Clerk is present and has an active user, prefer that identity and
    // persist it locally so the rest of the app sees the user immediately.
    if (useClerkUser && useClerkAuth) {
      try {
        const cUser = clerk.user as any;
        const isSignedIn = clerkAuth.isSignedIn;
        if (isSignedIn && cUser) {
          const id = cUser.id || cUser.userId || null;
          let email: string | null = null;
          let image: string | null = null;
          try {
            if (cUser.primaryEmailAddress && cUser.primaryEmailAddress.emailAddress) {
              email = cUser.primaryEmailAddress.emailAddress;
            } else if (cUser.emailAddresses && cUser.emailAddresses.length) {
              email = cUser.emailAddresses[0]?.emailAddress || null;
            }
          } catch (e) {}

          try {
            image = cUser.imageUrl || cUser.profileImageUrl || null;
          } catch (e) {}

          const name = (cUser.fullName as string) || (cUser.full_name as string) || '';
          if (id) {
            // Map Clerk user -> Neon (bridge) user and persist Neon id.
            (async () => {
              try {
                const { syncClerkUserToNeon } = require('../services/clerkUserSync');
                const bridge = await syncClerkUserToNeon({
                  id,
                  emailAddresses: [{ emailAddress: email }],
                  fullName: name,
                });

                // Critical: never expose a non-UUID user id to the rest of the app.
                // If the bridge cannot provide a Neon UUID, preserve an existing UUID
                // session or generate one once and persist it.
                const existing = await getSession();
                const existingUuid = existing?.id && isUuid(existing.id) ? existing.id : null;
                const bridgedUuid = bridge?.uuid && isUuid(bridge.uuid) ? bridge.uuid : null;
                const uid = bridgedUuid || existingUuid || uuidv4();
                setUser({
                  id: uid,
                  name: bridge?.name || name || '',
                  email: bridge?.email || email || '',
                  image: image || null,
                  imageUrl: image || null,
                });
                try {
                  void saveSession(
                    uid,
                    bridge?.name || name || '',
                    bridge?.email || email || '',
                    image || null,
                    image || null,
                    id
                  );
                } catch (e) {}
              } catch (e) {
                // Bridge failed (often offline). Do NOT overwrite an existing UUID session
                // with a generated UUID derived from the Clerk id; that would orphan
                // local SQLite rows and show 0 records offline.
                try {
                  const existing = await getSession();
                  const stableId = existing?.id && isUuid(existing.id) ? existing.id : null;
                  if (stableId) {
                    await saveSession(
                      stableId,
                      (existing as any)?.name || name || '',
                      (existing as any)?.email || email || '',
                      image || (existing as any)?.image || null,
                      image || (existing as any)?.imageUrl || null,
                      id
                    );
                    setUser({
                      id: stableId,
                      name: (existing as any)?.name || name || '',
                      email: (existing as any)?.email || email || '',
                      image: image || (existing as any)?.image || null,
                      imageUrl: image || (existing as any)?.imageUrl || null,
                    });
                  } else {
                    // No existing UUID session to preserve; create a fallback session.
                    await saveSession(
                      id,
                      name || '',
                      email || '',
                      image || null,
                      image || null,
                      id
                    );
                    const created = await getSession();
                    setUser((created as any) || null);
                  }
                } catch (ee) {
                  // As a last resort, keep user state as-is.
                  setUser((prev) => prev || null);
                }
              }
            })();
          }
        }
      } catch (e) {
        // ignore Clerk integration failures
      }
    }

    // If Clerk user profile fields change (for example, name updated in Clerk dashboard),
    // ensure we synchronize the update to Neon and local session. Rely on clerk.user
    // object changing reference or its fields updating.
    // We intentionally handle Clerk profile updates in a separate effect below
    // so that changes to `clerk.user` or `clerkAuth.isSignedIn` re-run and update
    // the local `user` state. This block is kept empty to preserve the original
    // initialization flow above.
    // subscribe to session changes
    const unsub = subscribeSession((s) => {
      setUser(s || null);
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // React to Clerk user changes and keep local session in sync.
  useEffect(() => {
    if (!useClerkUser || !useClerkAuth) return;
    const cUser = clerk.user as any;
    const isSignedIn = clerkAuth.isSignedIn;
    if (!isSignedIn || !cUser) return;

    const id = cUser.id || cUser.userId || null;
    let email: string | null = null;
    let image: string | null = null;
    try {
      if (cUser.primaryEmailAddress && cUser.primaryEmailAddress.emailAddress) {
        email = cUser.primaryEmailAddress.emailAddress;
      } else if (cUser.emailAddresses && cUser.emailAddresses.length) {
        email = cUser.emailAddresses[0]?.emailAddress || null;
      }
    } catch (e) {}

    const name = (cUser.fullName as string) || (cUser.full_name as string) || '';
    try {
      image = cUser.imageUrl || cUser.profileImageUrl || null;
    } catch (e) {}
    if (!id) return;

    (async () => {
      try {
        // Offline-first: do not attempt network bridge when offline.
        // Let the catch block preserve existing UUID session or create a stable local UUID.
        try {
          const NetInfo = require('@react-native-community/netinfo');
          const net = await NetInfo.fetch();
          if (!net.isConnected) throw new Error('offline');
        } catch (e) {
          // If NetInfo fails, proceed best-effort.
        }

        const { syncClerkUserToNeon } = require('../services/clerkUserSync');
        const bridge = await syncClerkUserToNeon({
          id,
          emailAddresses: email ? [{ emailAddress: email }] : [],
          fullName: name,
        });

        // Critical: never expose a non-UUID user id to the rest of the app.
        // If the bridge cannot provide a Neon UUID, preserve an existing UUID
        // session or generate one once and persist it.
        const existing = await getSession();
        const existingUuid = existing?.id && isUuid(existing.id) ? existing.id : null;
        const bridgedUuid = bridge?.uuid && isUuid(bridge.uuid) ? bridge.uuid : null;
        const uid = bridgedUuid || existingUuid || uuidv4();
        // persist authoritative session info
        try {
          await saveSession(
            uid,
            bridge?.name || name || '',
            bridge?.email || email || '',
            image || null,
            image || null,
            id
          );
        } catch (e) {}
        setUser({
          id: uid,
          name: bridge?.name || name || '',
          email: bridge?.email || email || '',
          image: image || null,
          imageUrl: image || null,
        });
      } catch (e) {
        // Bridge failed (often offline). Preserve existing UUID session when present
        // so offline SQLite continues to show cached data.
        try {
          const existing = await getSession();
          const stableId = existing?.id && isUuid(existing.id) ? existing.id : null;
          if (stableId) {
            await saveSession(
              stableId,
              (existing as any)?.name || name || '',
              (existing as any)?.email || email || '',
              image || (existing as any)?.image || null,
              image || (existing as any)?.imageUrl || null,
              id
            );
            setUser({
              id: stableId,
              name: (existing as any)?.name || name || '',
              email: (existing as any)?.email || email || '',
              image: image || (existing as any)?.image || null,
              imageUrl: image || (existing as any)?.imageUrl || null,
            });
          } else {
            // No UUID session exists yet; create a stable local UUID and store Clerk id separately.
            const localId = uuidv4();
            await saveSession(localId, name || '', email || '', image || null, image || null, id);
            const created = await getSession();
            setUser((created as any) || null);
          }
        } catch (ee) {
          setUser((prev) => prev || null);
        }
      }
    })();
  }, [clerk.user, clerkAuth.isSignedIn]);

  return { user, loading };
};

// When user identity changes (e.g., login on a new device), ensure local DB is populated.
// If local SQLite has no transactions for this user, attempt an immediate pull from Neon.
// This helps new devices bootstrap the user's data.
export const useAuthSyncOnLogin = (user: any) => {
  // no-op hook wrapper; kept for possible explicit use elsewhere
};

// Side-effect: trigger bootstrap pull when user becomes available
// Note: we deliberately do this outside the main hook to avoid re-running during initial load.
try {
  // runtime-only: subscribe to session events and run bootstrap when session is updated
  const { subscribeSession } = require('../utils/sessionEvents');
  subscribeSession(async (s: any) => {
    try {
      if (!s || !s.id) return;
      const NetInfo = require('@react-native-community/netinfo');
      const net = await NetInfo.fetch();
      if (!net.isConnected) return;
      // check local rows
      try {
        const { getTransactionsByUser } = require('../db/transactions');
        const rows = await getTransactionsByUser(s.id);
        if (!rows || rows.length === 0) {
          // Reset pull cursor so the first pull after login fetches everything.
          // Only do this when local DB is empty to avoid re-pulling on every login.
          try {
            const { executeSqlAsync } = require('../db/sqlite');
            const metaKey = `last_pull_server_version:${s.id}`;
            const cursorKey = `last_pull_cursor_v2:${s.id}`;
            await executeSqlAsync('DELETE FROM meta WHERE key IN (?, ?);', [metaKey, cursorKey]);
          } catch (ee) {}

          // bootstrap from server via the central sync manager
          try {
            const { scheduleSync } = require('../services/syncManager');
            scheduleSync({ source: 'auto', force: true } as any);
          } catch (ee) {}
        }
      } catch (e) {}
    } catch (e) {}
  });
} catch (e) {}
