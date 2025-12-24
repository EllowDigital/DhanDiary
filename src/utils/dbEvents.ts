type Callback = () => void;

const subs: Callback[] = [];

export const subscribeEntries = (cb: Callback) => {
  subs.push(cb);
  return () => {
    const idx = subs.indexOf(cb);
    if (idx >= 0) subs.splice(idx, 1);
  };
};

// Debounced notifier to coalesce rapid DB changes into a single notification.
let notifyTimer: any = null;
export const notifyEntriesChanged = () => {
  if (notifyTimer) return; // throttle
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    subs.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // ignore
      }
    });
  }, 50);
};

export default { subscribeEntries, notifyEntriesChanged };
