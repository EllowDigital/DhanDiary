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

// Robust check for Jest environment that works in RN and Node
const isTest = typeof process !== 'undefined' && !!process.env?.JEST_WORKER_ID;

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500, isTransient = defaultIsTransient } = opts;

  function sleep(ms: number) {
    // Skip waiting during tests to keep them fast
    if (isTest) return Promise.resolve();
    return new Promise((res) => setTimeout(res, ms));
  }

  let attempt = 0;
  let lastErr: any = null;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const transient = isTransient(err);

      // If error is permanent (not transient), fail immediately
      if (!transient) {
        // Log only if in Dev mode AND NOT in a test
        if (typeof __DEV__ !== 'undefined' && __DEV__ && !isTest) {
          console.warn('[retry] non-transient error, not retrying', err);
        }
        throw err;
      }

      if (attempt === maxRetries) break;

      // Exponential backoff with full jitter
      const delay = baseDelayMs * Math.pow(2, attempt);
      const jittered = Math.round(Math.random() * delay);

      if (typeof __DEV__ !== 'undefined' && __DEV__ && !isTest) {
        console.log(
          `[retry] attempt ${attempt + 1}/${maxRetries}, waiting ${jittered}ms (base ${delay}ms)`,
          err instanceof Error ? err.message : String(err)
        );
      }

      attempt += 1;
      await sleep(jittered);
    }
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__ && !isTest) {
    console.warn('[retry] exhausted retries', lastErr);
  }
  throw lastErr;
}

export default retryWithBackoff;
