import { init } from '../src/db/localDb';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() =>
    Promise.resolve({
      execAsync: jest.fn(() => Promise.resolve()),
      runAsync: jest.fn(() => Promise.resolve()),
      getAllAsync: jest.fn(() => Promise.resolve([])),
      getFirstAsync: jest.fn(() => Promise.resolve(null)),
    })
  ),
}));

describe('localDb', () => {
  it('initializes correctly', async () => {
    await init();
    expect(require('expo-sqlite').openDatabaseAsync).toHaveBeenCalled();
  });
});
