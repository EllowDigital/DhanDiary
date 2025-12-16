import { getFirebaseAuth } from '../firebase';

let lastRefreshAt = 0;
let inFlight: Promise<void> | null = null;

// Ensures we don't issue many token refresh calls in parallel or too frequently.
export async function ensureFreshIdToken(options?: { force?: boolean; minIntervalMs?: number }) {
  const auth = getFirebaseAuth();
  const now = Date.now();
  const minInterval = options?.minIntervalMs ?? 60_000;

  if (!auth.currentUser) return;

  // If a refresh is already in progress, await it.
  if (inFlight) {
    return inFlight;
  }

  // If not forced and last refresh was recent, skip.
  if (!options?.force && now - lastRefreshAt < minInterval) return;

  inFlight = (async () => {
    try {
      await auth.currentUser?.getIdToken(true);
      lastRefreshAt = Date.now();
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
