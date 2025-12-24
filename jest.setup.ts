// Jest setup (TypeScript copy) - kept for developer readability
// This file is not executed by Jest directly (see jest.setup.js), but provides
// a TypeScript-syntax reference for the mocks used during tests.

// Mock Expo Constants to avoid reading real native config in tests
jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
  manifest: {},
  default: { expoConfig: { extra: {} }, manifest: {} },
}));

// Mock NetInfo to avoid native module access
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
  addEventListener: jest.fn(() => jest.fn()),
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

// Mock neon client to avoid network calls during tests
jest.mock('src/api/neonClient', () => ({
  query: jest.fn().mockResolvedValue([]),
}));

export {};
