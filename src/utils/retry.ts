export async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 300) {
  let lastError: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // exponential backoff
      const wait = delayMs * Math.pow(2, i);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw lastError;
}
