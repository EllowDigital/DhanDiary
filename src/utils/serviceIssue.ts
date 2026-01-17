const normalize = (err: unknown): string => {
  try {
    if (!err) return '';
    if (typeof err === 'string') return err;

    // Clerk-like shape: { errors: [{ message }] }
    const anyErr: any = err as any;
    if (Array.isArray(anyErr?.errors) && anyErr.errors[0]?.message) {
      return String(anyErr.errors[0].message);
    }

    if (anyErr?.message) return String(anyErr.message);
    return JSON.stringify(err);
  } catch (e) {
    return '';
  }
};

/**
 * Heuristic classifier for "service down" situations:
 * device is online but upstream (Clerk/Neon) is failing.
 */
export const isLikelyServiceDownError = (err: unknown): boolean => {
  const msg = normalize(err).toLowerCase();
  if (!msg) return false;

  return (
    msg.includes('server temporarily unavailable') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable') ||
    msg.includes('bad gateway') ||
    msg.includes('gateway') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('network request failed') ||
    msg.includes('fetch') ||
    msg.includes('connection') ||
    msg.includes('socket') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('dns')
  );
};

export const debugAuthError = (tag: string, err: unknown) => {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // Use error level in dev so it is easy to spot.
      console.error(tag, err);
    } else {
      console.warn(tag, err instanceof Error ? err.message : String(err ?? ''));
    }
  } catch (e) {
    // ignore
  }
};
