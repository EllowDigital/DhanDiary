import { useState, useEffect } from 'react';
import { getSession, saveSession } from '../db/session';
import { subscribeSession } from '../utils/sessionEvents';
import { query } from '../api/neonClient';
import NetInfo from '@react-native-community/netinfo';
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
                  await saveSession(u.id, u.name || '', u.email || '');
                  setUser({ id: u.id, name: u.name || '', email: u.email || '' });
                } else {
                  setUser(session || null);
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
                const uid = bridge?.uuid || id;
                setUser({
                  id: uid,
                  name: bridge?.name || name || '',
                  email: bridge?.email || email || '',
                  image: image || null,
                });
                try {
                  void saveSession(uid, bridge?.name || name || '', bridge?.email || email || '');
                } catch (e) {}
              } catch (e) {
                // Fallback: persist clerk id if bridge fails
                setUser({ id, name: name || '', email: email || '', image: image || null });
                try {
                  void saveSession(id, name || '', email || '');
                } catch (ee) {}
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
    return () => unsub();
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
        const { syncClerkUserToNeon } = require('../services/clerkUserSync');
        const bridge = await syncClerkUserToNeon({
          id,
          emailAddresses: email ? [{ emailAddress: email }] : [],
          fullName: name,
        });
        const uid = bridge?.uuid || id;
        // persist authoritative session info
        try {
          await saveSession(uid, bridge?.name || name || '', bridge?.email || email || '');
        } catch (e) {}
        setUser({
          id: uid,
          name: bridge?.name || name || '',
          email: bridge?.email || email || '',
          image: image || null,
          imageUrl: image || null,
        });
      } catch (e) {
        // fallback to clerk identity
        setUser({
          id: id,
          name: name || '',
          email: email || '',
          image: image || null,
          imageUrl: image || null,
        });
        try {
          await saveSession(id, name || '', email || '');
        } catch (ee) {}
      }
    })();
  }, [clerk.user, clerkAuth.isSignedIn]);

  return { user, loading };
};
