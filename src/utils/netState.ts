export type NetStateLike = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

/**
 * Returns true when the device is connected and the internet is reachable.
 *
 * NetInfo can report `isInternetReachable` as null/undefined transiently;
 * in that case we treat `isConnected=true` as online.
 */
export const isNetOnline = (state: NetStateLike | null | undefined): boolean => {
  if (!state?.isConnected) return false;
  return state.isInternetReachable !== false;
};
