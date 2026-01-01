let _cancelRequested = false;

// Shared cancel flag for sync operations.
// This is intentionally simple: the goal is to allow logout/navigation to
// request cancellation so long-running push/pull loops can exit quickly.

export const requestSyncCancel = () => {
  _cancelRequested = true;
};

export const resetSyncCancel = () => {
  _cancelRequested = false;
};

export const isSyncCancelRequested = () => _cancelRequested;

export const throwIfSyncCancelled = () => {
  if (_cancelRequested) {
    const err: any = new Error('sync_cancelled');
    err.code = 'SYNC_CANCELLED';
    throw err;
  }
};
