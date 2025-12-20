// Firebase removed — provide minimal stubs to avoid runtime import errors.

export const getFirebaseApp = () => {
  throw new Error('Firebase removed: getFirebaseApp is not available in local-only mode');
};

export const getFirebaseAuth = () => {
  throw new Error('Firebase removed: getFirebaseAuth is not available in local-only mode');
};

export const getFirestoreDb = () => {
  throw new Error('Firebase removed: getFirestoreDb is not available in local-only mode');
};

// Flag indicating whether a web Firebase app is initialized in this build.
// In local-only or trimmed builds this will be `false`. Consumers should
// check this flag before attempting to use the Firebase Web SDK fallback.
export const hasWebFirebase = false;
