import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, Auth } from 'firebase/auth';
import { getReactNativePersistence } from 'firebase/auth/react-native';
import { getFirestore, enableIndexedDbPersistence, Firestore } from 'firebase/firestore';

const getFirebaseExtra = () => {
  const extra = (Constants?.expoConfig?.extra as any) || {};
  return extra.firebase || {};
};

const buildFirebaseConfig = () => {
  const extra = getFirebaseExtra();
  return {
    apiKey: extra.apiKey || process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: extra.authDomain || process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: extra.projectId || process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: extra.storageBucket || process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId:
      extra.messagingSenderId || process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: extra.appId || process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    measurementId: extra.measurementId || process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
};

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestore: Firestore | null = null;

const ensureFirebase = () => {
  if (!firebaseApp) {
    const config = buildFirebaseConfig();
    if (!config.apiKey || !config.projectId) {
      throw new Error('Firebase config missing. Did you set EXPO_PUBLIC_FIREBASE_* values?');
    }
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(config);
  }

  if (!firebaseAuth) {
    firebaseAuth = initializeAuth(firebaseApp, {
      persistence:
        Platform.OS === 'web' ? browserLocalPersistence : getReactNativePersistence(AsyncStorage),
    });
  }

  if (!firestore) {
    firestore = getFirestore(firebaseApp);
    if (Platform.OS === 'web') {
      enableIndexedDbPersistence(firestore).catch(() => {
        // ignore persistence errors (already enabled, private browsing, etc.)
      });
    }
  }
};

export const getFirebaseApp = () => {
  ensureFirebase();
  return firebaseApp!;
};

export const getFirebaseAuth = () => {
  ensureFirebase();
  return firebaseAuth!;
};

export const getFirestoreDb = () => {
  ensureFirebase();
  return firestore!;
};
