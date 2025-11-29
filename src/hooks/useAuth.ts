import { useState, useEffect } from 'react';
import { getSession, saveSession } from '../db/session';
import { subscribeSession } from '../utils/sessionEvents';
import { query } from '../api/neonClient';
import NetInfo from '@react-native-community/netinfo';

type UserSession = { id: string; name: string; email: string };

export const useAuth = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

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
    // subscribe to session changes
    const unsub = subscribeSession((s) => {
      setUser(s || null);
    });
    return () => unsub();
  }, []);

  return { user, loading };
};
