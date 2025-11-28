import { useState, useEffect } from 'react';
import { getSession } from '../db/session';
import { subscribeSession } from '../utils/sessionEvents';

type UserSession = { id: string; name: string; email: string };

export const useAuth = () => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const session = await getSession();
        setUser(session || null);
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
