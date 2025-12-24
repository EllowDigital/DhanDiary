// Jest setup (runtime JavaScript) - executed by Jest via jest.config.js
// Mocks environment/native modules to keep tests deterministic.

// Mock Expo Constants
jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
  manifest: {},
  default: { expoConfig: { extra: {} }, manifest: {} },
}));

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(() => jest.fn()),
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

// Mock the neon client module used by the app so tests don't attempt network calls
try {
  jest.mock('src/api/neonClient', () => ({ query: jest.fn().mockResolvedValue([]) }));
} catch (e) {}
try {
  jest.mock('../src/api/neonClient', () => ({ query: jest.fn().mockResolvedValue([]) }));
} catch (e) {}
try {
  jest.mock('./src/api/neonClient', () => ({ query: jest.fn().mockResolvedValue([]) }));
} catch (e) {}

// Provide a lightweight global stub for any other native modules the tests might import
global.__TEST__ = true;

// Optionally silence noisy console warnings from libs during tests (uncomment if needed)
// const originalError = console.error;
// console.error = (...args) => {
//   if (String(args[0] || '').includes('The global process.env.EXPO_OS is not defined')) return;
//   originalError.apply(console, args);
// };
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
}));

// No runtime local DB module to mock here.

// Provide a benign mock for the local DB layer (tests expect localDb APIs).
try {
  jest.mock('src/db/localDb', () => ({
    init: jest.fn(() => Promise.resolve()),
    isDbOperational: jest.fn(() => Promise.resolve(true)),
    getDb: jest.fn(() => Promise.resolve(null)),
    addLocalEntry: jest.fn(() => Promise.resolve(null)),
    getEntries: jest.fn(() => Promise.resolve([])),
    getUnsyncedEntries: jest.fn(() => Promise.resolve([])),
    queueRemoteRow: jest.fn(() => Promise.resolve()),
    flushQueuedRemoteRows: jest.fn(() => Promise.resolve()),
    clearAllData: jest.fn(() => Promise.resolve()),
    getSession: jest.fn(() => Promise.resolve(null)),
    saveSession: jest.fn(() => Promise.resolve()),
    getPendingProfileUpdates: jest.fn(() => Promise.resolve([])),
    markPendingProfileProcessed: jest.fn(() => Promise.resolve()),
    queueLocalRemoteMapping: jest.fn(() => Promise.resolve()),
    flushQueuedLocalRemoteMappings: jest.fn(() => Promise.resolve()),
    getQueuedLocalRemoteMappings: jest.fn(() => Promise.resolve([])),
    default: {},
  }));
} catch (e) {}
try {
  jest.mock('../src/db/localDb', () => ({
    init: jest.fn(() => Promise.resolve()),
    isDbOperational: jest.fn(() => Promise.resolve(true)),
    getDb: jest.fn(() => Promise.resolve(null)),
    addLocalEntry: jest.fn(() => Promise.resolve(null)),
    getEntries: jest.fn(() => Promise.resolve([])),
    getUnsyncedEntries: jest.fn(() => Promise.resolve([])),
    queueRemoteRow: jest.fn(() => Promise.resolve()),
    flushQueuedRemoteRows: jest.fn(() => Promise.resolve()),
    clearAllData: jest.fn(() => Promise.resolve()),
    getSession: jest.fn(() => Promise.resolve(null)),
    saveSession: jest.fn(() => Promise.resolve()),
    getPendingProfileUpdates: jest.fn(() => Promise.resolve([])),
    markPendingProfileProcessed: jest.fn(() => Promise.resolve()),
    queueLocalRemoteMapping: jest.fn(() => Promise.resolve()),
    flushQueuedLocalRemoteMappings: jest.fn(() => Promise.resolve()),
    getQueuedLocalRemoteMappings: jest.fn(() => Promise.resolve([])),
    default: {},
  }));
} catch (e) {}
// Mock session utilities used by services/screens
try {
  jest.mock('src/db/session', () => ({
    getSession: jest.fn(() => Promise.resolve(null)),
    saveSession: jest.fn(() => Promise.resolve()),
    clearSession: jest.fn(() => Promise.resolve()),
    default: {},
  }));
} catch (e) {}
try {
  jest.mock('../src/db/session', () => ({
    getSession: jest.fn(() => Promise.resolve(null)),
    saveSession: jest.fn(() => Promise.resolve()),
    clearSession: jest.fn(() => Promise.resolve()),
    default: {},
  }));
} catch (e) {}
try {
  jest.mock('./src/db/session', () => ({
    getSession: jest.fn(() => Promise.resolve(null)),
    saveSession: jest.fn(() => Promise.resolve()),
    clearSession: jest.fn(() => Promise.resolve()),
    default: {},
  }));
} catch (e) {}
try {
  jest.mock('./src/db/localDb', () => ({
    init: jest.fn(() => Promise.resolve()),
    isDbOperational: jest.fn(() => Promise.resolve(true)),
    getDb: jest.fn(() => Promise.resolve(null)),
    addLocalEntry: jest.fn(() => Promise.resolve(null)),
    getEntries: jest.fn(() => Promise.resolve([])),
    getUnsyncedEntries: jest.fn(() => Promise.resolve([])),
    queueRemoteRow: jest.fn(() => Promise.resolve()),
    flushQueuedRemoteRows: jest.fn(() => Promise.resolve()),
    clearAllData: jest.fn(() => Promise.resolve()),
    getSession: jest.fn(() => Promise.resolve(null)),
    saveSession: jest.fn(() => Promise.resolve()),
    getPendingProfileUpdates: jest.fn(() => Promise.resolve([])),
    markPendingProfileProcessed: jest.fn(() => Promise.resolve()),
    queueLocalRemoteMapping: jest.fn(() => Promise.resolve()),
    flushQueuedLocalRemoteMappings: jest.fn(() => Promise.resolve()),
    getQueuedLocalRemoteMappings: jest.fn(() => Promise.resolve([])),
    default: {},
  }));
} catch (e) {}
