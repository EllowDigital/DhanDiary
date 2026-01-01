jest.mock('../src/sync/pushToNeon', () => {
  const fn = jest.fn();
  return { __esModule: true, default: fn };
});
jest.mock('../src/sync/pullFromNeon', () => {
  const fn = jest.fn();
  return { __esModule: true, default: fn };
});

const pushToNeon = require('../src/sync/pushToNeon').default as jest.Mock;
const pullFromNeon = require('../src/sync/pullFromNeon').default as jest.Mock;

const { runFullSync } = require('../src/sync/runFullSync');

describe('runFullSync', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('calls push before pull', async () => {
    const order: string[] = [];
    pushToNeon.mockImplementation(async () => {
      order.push('push');
      return { pushed: ['a'] };
    });
    pullFromNeon.mockImplementation(async () => {
      order.push('pull');
      return { pulled: 0 };
    });

    await runFullSync();
    expect(order).toEqual(['push', 'pull']);
    expect(pushToNeon).toHaveBeenCalled();
    expect(pullFromNeon).toHaveBeenCalled();
  });

  test('pull runs even if push fails', async () => {
    pushToNeon.mockImplementation(async () => {
      throw new Error('push failed');
    });
    pullFromNeon.mockResolvedValue({ pulled: 1 });

    await expect(runFullSync()).resolves.not.toThrow();
    expect(pullFromNeon).toHaveBeenCalled();
  });

  test('lock prevents overlapping sync calls', async () => {
    let resolvePush: () => void;
    const pushPromise = new Promise<void>((res) => (resolvePush = res));
    pushToNeon.mockImplementation(() => pushPromise);
    pullFromNeon.mockImplementation(async () => ({ pulled: 0 }));

    const first = runFullSync();
    // second call should be skipped immediately (lock prevents overlap)
    const second = runFullSync();

    const secondRes = await second;
    expect(secondRes).toEqual({ status: 'skipped', reason: 'already_running' });

    // finish first
    resolvePush!();
    await first;
  });

  test('errors are swallowed and do not throw', async () => {
    pushToNeon.mockImplementation(async () => {
      throw new Error('push boom');
    });
    pullFromNeon.mockImplementation(async () => {
      throw new Error('pull boom');
    });

    await expect(runFullSync()).resolves.not.toThrow();
  });

  test('retries transient push failures and succeeds', async () => {
    const calls: string[] = [];
    pushToNeon.mockImplementationOnce(async () => {
      calls.push('first');
      throw new Error('timeout');
    });
    pushToNeon.mockImplementationOnce(async () => {
      calls.push('second');
      return { pushed: ['a'] };
    });
    pullFromNeon.mockImplementation(async () => ({ pulled: 0 }));

    await runFullSync();
    expect(calls).toEqual(['first', 'second']);
    expect(pullFromNeon).toHaveBeenCalled();
  });

  test('does not retry non-transient push errors', async () => {
    pushToNeon.mockImplementation(async () => {
      throw new Error('validation error');
    });
    pullFromNeon.mockImplementation(async () => ({ pulled: 0 }));

    await runFullSync();
    // push should have been called exactly once (no retry)
    expect(pushToNeon).toHaveBeenCalledTimes(1);
    expect(pullFromNeon).toHaveBeenCalled();
  });
});
