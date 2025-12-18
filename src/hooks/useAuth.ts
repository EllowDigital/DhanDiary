import { useEffect, useState } from 'react';
import {
  onAuthStateChanged,
} from '../services/auth';

export type AuthUser = {
  uid: string;
  name: string;
  email: string;
  provider: string;
};

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onAuthStateChanged((localUser) => {
      if (!isMounted) return;
      if (!localUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser({
        uid: localUser.uid,
        name: localUser.name || '',
        email: localUser.email || '',
        provider: (localUser.providers && localUser.providers[0]) || 'password',
      });
      setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return { user, loading };
};
