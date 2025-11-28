type Session = { id: string; name: string; email: string } | null;

const subs: Array<(s: Session) => void> = [];

export const subscribeSession = (cb: (s: Session) => void) => {
  subs.push(cb);
  return () => {
    const idx = subs.indexOf(cb);
    if (idx >= 0) subs.splice(idx, 1);
  };
};

export const notifySessionChanged = async () => {
  // lazy import to avoid circular deps
  try {
    const { getSession } = require('../db/session');
    const s = await getSession();
    subs.forEach((cb) => {
      try {
        cb(s || null);
      } catch (e) {}
    });
  } catch (e) {
    subs.forEach((cb) => {
      try {
        cb(null);
      } catch (e) {}
    });
  }
};
