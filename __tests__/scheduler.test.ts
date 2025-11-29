// Mock NetInfo to avoid runtime errors in Jest environment
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  addEventListener: jest.fn().mockImplementation(() => () => {}),
}));

// Load module lazily so we can stub internal function references
const syncModule = require('../src/services/syncManager');
const { startForegroundSyncScheduler, stopForegroundSyncScheduler } = syncModule;
const syncManager = syncModule;

jest.useFakeTimers();

describe('Foreground scheduler', () => {
  afterEach(() => {
    stopForegroundSyncScheduler();
    jest.restoreAllMocks();
    jest.clearAllTimers();
  });

  test('calls syncBothWays on interval', async () => {
    // ensure no leftover timer from other tests
    stopForegroundSyncScheduler();
    // Replace internal syncBothWays implementation used by the module
    syncManager.syncBothWays = jest.fn().mockResolvedValue({ pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 });

    // Spy on setInterval so we can capture the timer callback and invoke it manually
    const timers: Function[] = [];
    const setIntervalSpy = jest.spyOn(global, 'setInterval' as any).mockImplementation((fn: Function, _ms: number) => {
      timers.push(fn);
      return 123 as any;
    });

    startForegroundSyncScheduler(1000);

    // ensure setInterval was installed
    expect(setIntervalSpy).toHaveBeenCalled();

    // Manually invoke the captured timer callback to simulate the tick
    expect(timers.length).toBeGreaterThan(0);
    await timers[0]();
    await Promise.resolve();
    expect(syncManager.syncBothWays).toHaveBeenCalledTimes(1);

    // Invoke again to simulate the next tick
    await timers[0]();
    await Promise.resolve();
    expect(syncManager.syncBothWays).toHaveBeenCalledTimes(2);
  });

  test('stopForegroundSyncScheduler clears interval', () => {
    syncManager.syncBothWays = jest.fn().mockResolvedValue({ pushed: 0, updated: 0, deleted: 0, pulled: 0, merged: 0, total: 0 });
    startForegroundSyncScheduler(1000);
    stopForegroundSyncScheduler();
    jest.advanceTimersByTime(5000);
    expect(syncManager.syncBothWays).not.toHaveBeenCalled();
  });
});
