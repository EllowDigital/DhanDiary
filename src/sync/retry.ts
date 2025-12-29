type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  isTransient?: (err: unknown) => boolean;
};

const defaultIsTransient = (err: unknown) => {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection') ||
    msg.includes('network') ||
    msg.includes('socket') ||
    msg.includes('econnreset') ||
    msg.includes('enotfound') ||
    msg.includes('fetch') ||
    msg.includes('offline') ||
    msg.includes('502') ||
    msg.includes('503')
  );
};

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500, isTransient = defaultIsTransient } = opts;

  let attempt = 0;
  let lastErr: any = null;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = isTransient(err);
      if (!transient) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('[retry] non-transient error, not retrying', err);
        }
        throw err;
      }

      if (attempt === maxRetries) break;

      const delay = baseDelayMs * Math.pow(2, attempt);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log(`[retry] attempt ${attempt + 1}/${maxRetries}, retrying after ${delay}ms`, err?.toString?.() || err);
      }
      await new Promise((res) => setTimeout(res, delay));
      attempt += 1;
    }
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn('[retry] exhausted retries', lastErr);
  }
  throw lastErr;
}

export default retryWithBackoff;
