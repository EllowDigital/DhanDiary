import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged as servicesOnAuthStateChanged } from '../services/auth';
const tryGetUserService = () => {
  try {
    return require('../services/userService');
  } catch (e) {
    return null;
  }
};

export type AuthState = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'error';

type AuthContextShape = {
  status: AuthState;
  user: any | null;
  error: string | null;
};

const AuthContext = createContext<AuthContextShape | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthState>('loading');
  const [user, setUser] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const unsub = servicesOnAuthStateChanged((u: any) => {
      if (!mounted) return;
      setError(null);

      // Immediately reflect auth state so UI isn't blocked by Firestore sync
      if (!u) {
        setUser(null);
        setStatus('unauthenticated');
        return;
      }

      setUser(u);
      setStatus('authenticated');

      // Run Firestore sync in background. Don't block UI; capture errors.
      (async () => {
        try {
          const userService: any = tryGetUserService();
          if (userService) {
            if (typeof userService.ensureUserDocumentForCurrentUser === 'function') {
              await userService.ensureUserDocumentForCurrentUser();
            } else if (typeof userService.syncUserToFirestore === 'function') {
              await userService.syncUserToFirestore(u);
            }
          }
        } catch (e) {
          // Don't change auth status; surface error for UI if needed
          if (mounted) setError((e as any)?.message || String(e));
        }
      })();
    });

    return () => {
      mounted = false;
      try {
        if (unsub && typeof unsub === 'function') unsub();
      } catch (e) {}
    };
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, error }}>{children}</AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider');
  return ctx;
};

export default AuthContext;
