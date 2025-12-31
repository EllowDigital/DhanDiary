import navigationRef, { isReady } from '../src/utils/rootNavigation';
import { resetRoot } from '../src/utils/rootNavigation';

describe('rootNavigation.resetRoot', () => {
  beforeEach(() => {
    // Ensure ref can be manipulated in test env
    // @ts-ignore - test harness
    navigationRef.isReady = () => true;
    // @ts-ignore
    navigationRef.resetRoot = jest.fn();
    // @ts-ignore
    navigationRef.dispatch = jest.fn();
  });

  it('calls resetRoot on the navigation ref when available', () => {
    const state = { index: 0, routes: [{ name: 'Auth' }] } as any;
    // @ts-ignore
    resetRoot(state);
    // @ts-ignore
    expect(navigationRef.resetRoot).toHaveBeenCalledWith(state);
  });

  it('falls back to dispatch CommonActions.reset when resetRoot not available', () => {
    // remove resetRoot
    // @ts-ignore
    navigationRef.resetRoot = undefined;
    const state = { index: 0, routes: [{ name: 'Main' }] } as any;
    // @ts-ignore
    resetRoot(state);
    // @ts-ignore
    expect(navigationRef.dispatch).toHaveBeenCalled();
  });
});
