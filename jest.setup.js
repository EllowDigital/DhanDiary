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
