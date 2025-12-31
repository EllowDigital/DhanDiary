// Simple pub/sub for banner visibility so headers can adjust safe-area padding
type Listener = (visible: boolean) => void;
const listeners = new Set<Listener>();
let visible = false;

export const setBannerVisible = (v: boolean) => {
  visible = !!v;
  listeners.forEach((l) => {
    try {
      l(visible);
    } catch (e) {}
  });
};

export const subscribeBanner = (listener: Listener) => {
  listeners.add(listener);
  // call immediately with current value
  try {
    listener(visible);
  } catch (e) {}
  return () => listeners.delete(listener);
};

export const isBannerVisible = () => visible;

export default { setBannerVisible, subscribeBanner, isBannerVisible };
