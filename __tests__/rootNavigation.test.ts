import navigationRef, { isReady } from '../src/utils/rootNavigation';
import { resetRoot } from '../src/utils/rootNavigation';

describe('rootNavigation.resetRoot', () => {
  beforeEach(() => {
    // Ensure ref can be manipulated in test env
    navigationRef.isReady = () => true;

    navigationRef.resetRoot = jest.fn();

    navigationRef.dispatch = jest.fn();
  });

  it('calls resetRoot on the navigation ref when available', () => {
    const state = { index: 0, routes: [{ name: 'Auth' }] } as any;

    resetRoot(state);

    expect(navigationRef.resetRoot).toHaveBeenCalledWith(state);
  });

  it('falls back to dispatch CommonActions.reset when resetRoot not available', () => {
    // FIX: Cast to 'any' to allow setting it to undefined for testing
    (navigationRef as any).resetRoot = undefined;

    const state = { index: 0, routes: [{ name: 'Main' }] } as any;

    resetRoot(state);

    expect(navigationRef.dispatch).toHaveBeenCalled();
  });
});
