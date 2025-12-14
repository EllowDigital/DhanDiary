import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../firebase';

export type AuthUser = {
  uid: string;
  name: string;
  email: string;
  providerId: string;
};

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();

    let stopProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (stopProfile) {
        stopProfile();
        stopProfile = null;
      }
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Ensure profile doc exists and subscribe to updates
      const userRef = doc(db, 'users', firebaseUser.uid);
      stopProfile = onSnapshot(
        userRef,
        async (snapshot) => {
          if (!snapshot.exists()) {
            await setDoc(
              userRef,
              {
                name: firebaseUser.displayName || '',
                email: firebaseUser.email || '',
                providerId: firebaseUser.providerData[0]?.providerId || 'password',
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          }
          const data = snapshot.data() || {};
          setUser({
            uid: firebaseUser.uid,
            name: data.name || firebaseUser.displayName || '',
            email: data.email || firebaseUser.email || '',
            providerId: data.providerId || firebaseUser.providerData[0]?.providerId || 'password',
          });
          setLoading(false);
        },
        (error) => {
          console.error('Failed to load profile', error);
          setUser({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || '',
            email: firebaseUser.email || '',
            providerId: firebaseUser.providerData[0]?.providerId || 'password',
          });
          setLoading(false);
        }
      );

    });

    return () => {
      if (stopProfile) stopProfile();
      unsubscribe();
    };
  }, []);

  return { user, loading };
};
