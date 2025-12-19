import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged as servicesOnAuthStateChanged } from '../services/auth';
const tryGetUserService = () => {
  try {
    // eslint-disable-next-line global-require
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
    const unsub = servicesOnAuthStateChanged(async (u: any) => {
      if (!mounted) return;
      setStatus('loading');
      setError(null);
      if (!u) {
        setUser(null);
        setStatus('unauthenticated');
        return;
      }

      // Ensure Firestore user exists/updated before marking authenticated
      try {
        const userService: any = tryGetUserService();
        if (userService && typeof userService.ensureUserDocumentForCurrentUser === 'function') {
          await userService.ensureUserDocumentForCurrentUser();
        } else if (userService && typeof userService.syncUserToFirestore === 'function') {
          await userService.syncUserToFirestore(u);
        }
        setUser(u);
        setStatus('authenticated');
      } catch (e: any) {
        setError(e?.message || String(e));
        setStatus('error');
      }
    });

    return () => {
      mounted = false;
      try {
        unsub && typeof unsub === 'function' && unsub();
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
