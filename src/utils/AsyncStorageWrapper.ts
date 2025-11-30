// Lightweight wrapper for AsyncStorage that falls back to an in-memory
// implementation when the native module is not available (e.g. Expo Go).
// This keeps the app from crashing in development while you use a development
// client or before installing native dependencies. For production builds,
// prefer the real `@react-native-async-storage/async-storage` native module.
let AsyncStorageImpl: any = null;

try {
  // Try to require the community AsyncStorage module

  const mod = require('@react-native-async-storage/async-storage');
  AsyncStorageImpl = mod && mod.default ? mod.default : mod;
  // If it appears unusable, fall through to fallback
  if (!AsyncStorageImpl || typeof AsyncStorageImpl.getItem !== 'function') {
    AsyncStorageImpl = null;
  }
} catch (e) {
  AsyncStorageImpl = null;
}

if (!AsyncStorageImpl) {
  // In-memory fallback (best-effort). Persists only during app process lifetime.
  const store: Record<string, string> = {};
  AsyncStorageImpl = {
    getItem: async (k: string) => (k in store ? store[k] : null),
    setItem: async (k: string, v: string) => {
      store[k] = String(v);
      return null;
    },
    removeItem: async (k: string) => {
      delete store[k];
      return null;
    },
    clear: async () => {
      Object.keys(store).forEach((k) => delete store[k]);
      return null;
    },
    getAllKeys: async () => Object.keys(store),
  };
}

export default AsyncStorageImpl;
