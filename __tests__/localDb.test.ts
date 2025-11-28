import { init } from '../src/db/localDb';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() =>
    Promise.resolve({
      execAsync: jest.fn(),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(() => Promise.resolve([])),
      getFirstAsync: jest.fn(),
    })
  ),
}));

describe('localDb', () => {
  it('initializes correctly', async () => {
    await init();
    expect(require('expo-sqlite').openDatabaseAsync).toHaveBeenCalled();
  });
});
