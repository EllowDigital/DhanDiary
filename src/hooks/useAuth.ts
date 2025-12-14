import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '../firebase';

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
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();

    let stopProfile: (() => void) | null = null;
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (stopProfile) {
        stopProfile();
        stopProfile = null;
      }

      if (!firebaseUser) {
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      const baseProfile = {
        name: firebaseUser.displayName || '',
        email: firebaseUser.email || '',
        provider: firebaseUser.providerData[0]?.providerId || 'password',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const attachProfile = async () => {
        const userRef = doc(db, 'user', firebaseUser.uid);
        try {
          const snapshot = await getDoc(userRef);
          if (!snapshot.exists()) {
            await setDoc(userRef, baseProfile, { merge: true });
          }

          if (!isMounted || auth.currentUser?.uid !== firebaseUser.uid) {
            return;
          }

          const initialData = snapshot.exists() ? snapshot.data() || {} : baseProfile;
          setUser({
            uid: firebaseUser.uid,
            name: initialData.name || baseProfile.name,
            email: initialData.email || baseProfile.email,
            provider: initialData.provider || baseProfile.provider,
          });
          setLoading(false);

          stopProfile = onSnapshot(
            userRef,
            (profileSnap) => {
              const data = profileSnap.data() || {};
              setUser({
                uid: firebaseUser.uid,
                name: data.name || baseProfile.name,
                email: data.email || baseProfile.email,
                provider: data.provider || baseProfile.provider,
              });
            },
            (error) => {
              console.warn('Profile listener stopped', error);
              stopProfile = null;
            }
          );
        } catch (error: any) {
          if (!isMounted) return;
          if (error?.code === 'permission-denied') {
            console.warn(
              'Firestore rules denied access to user/{uid}. Falling back to auth profile only.'
            );
          } else {
            console.error('Failed to load profile', error);
          }
          setUser({
            uid: firebaseUser.uid,
            name: baseProfile.name,
            email: baseProfile.email,
            provider: baseProfile.provider,
          });
          setLoading(false);
        }
      };

      attachProfile();
    });

    return () => {
      isMounted = false;
      if (stopProfile) stopProfile();
      unsubscribe();
    };
  }, []);

  return { user, loading };
};
