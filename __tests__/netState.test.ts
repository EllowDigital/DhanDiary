import { isNetOnline } from '../src/utils/netState';

describe('netState', () => {
  test('returns false when disconnected', () => {
    expect(isNetOnline({ isConnected: false, isInternetReachable: true })).toBe(false);
    expect(isNetOnline({ isConnected: null as any, isInternetReachable: true })).toBe(false);
    expect(isNetOnline(null)).toBe(false);
  });

  test('returns false when internet not reachable', () => {
    expect(isNetOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  test('treats connected + unknown reachability as online', () => {
    expect(isNetOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isNetOnline({ isConnected: true })).toBe(true);
  });

  test('returns true when connected and reachable', () => {
    expect(isNetOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });
});
