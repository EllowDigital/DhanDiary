type AbortControllerLike = {
  signal: { aborted: boolean };
  abort: () => void;
};

let _cancelRequested = false;
let _abortController: AbortControllerLike | null = null;

const createAbortController = (): AbortControllerLike | null => {
  try {
    const C = (globalThis as any)?.AbortController;
    if (typeof C !== 'function') return null;
    return new C();
  } catch (_e) {
    return null;
  }
};

const getAbortController = (): AbortControllerLike | null => {
  if (_abortController && !_abortController.signal.aborted) return _abortController;
  _abortController = createAbortController();
  return _abortController;
};

// Shared cancel flag for sync operations.
// This is intentionally simple: the goal is to allow logout/navigation to
// request cancellation so long-running push/pull loops can exit quickly.

export const requestSyncCancel = () => {
  const c = getAbortController();
  if (c) {
    c.abort();
    return;
  }
  _cancelRequested = true;
};

export const resetSyncCancel = () => {
  _cancelRequested = false;
  _abortController = createAbortController();
};

export const isSyncCancelRequested = () => {
  const aborted = _abortController?.signal?.aborted ?? false;
  return aborted || _cancelRequested;
};

export const throwIfSyncCancelled = () => {
  if (isSyncCancelRequested()) {
    const err: any = new Error('sync_cancelled');
    err.code = 'SYNC_CANCELLED';
    throw err;
  }
};
