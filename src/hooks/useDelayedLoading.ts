import { useEffect, useState } from 'react';

/**
 * Returns a `visible` boolean that becomes true only if `loading` remains true
 * for longer than `delayMs`. This prevents a spinner flash on very fast loads.
 */
export default function useDelayedLoading(loading: boolean, delayMs = 160) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (loading) {
      t = setTimeout(() => setVisible(true), delayMs);
    } else {
      if (t) clearTimeout(t);
      setVisible(false);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [loading, delayMs]);

  return visible;
}
