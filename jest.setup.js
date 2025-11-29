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

jest.mock('expo-sqlite', () => {
  const mockDb = {
    transaction: jest.fn(function (cb) {
      const tx = {
        executeSql: jest.fn((sql, params, success) => {
          if (success) {
            success(tx, { rows: { _array: [], length: 0, item: () => null } });
          }
        }),
      };
      cb(tx);
    }),
    execAsync: jest.fn(() => Promise.resolve()),
    runAsync: jest.fn(() => Promise.resolve()),
    getFirstAsync: jest.fn(() => Promise.resolve(null)),
    getAllAsync: jest.fn(() => Promise.resolve([])),
    closeAsync: jest.fn(() => Promise.resolve()),
  };

  return {
    openDatabase: jest.fn(() => mockDb),
    openDatabaseAsync: jest.fn(() => Promise.resolve(mockDb)),
  };
});
