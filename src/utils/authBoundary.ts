type Listener = (isSigningOut: boolean) => void;

let _isSigningOut = false;
const listeners = new Set<Listener>();

export const getIsSigningOut = () => _isSigningOut;

export const setIsSigningOut = (v: boolean) => {
  const next = Boolean(v);
  if (_isSigningOut === next) return;
  _isSigningOut = next;
  try {
    listeners.forEach((l) => {
      try {
        l(_isSigningOut);
      } catch (e) {}
    });
  } catch (e) {}
};

export const subscribeIsSigningOut = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
