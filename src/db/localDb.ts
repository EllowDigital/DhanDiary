// Offline/local DB support removed: provide safe no-op implementations so runtime
// code running in online-only mode (Clerk + NeonDB) does not throw.

// Export functions with compatible signatures so callers across the app compile
export const init = async (..._args: any[]): Promise<void> => {
  // no-op initializer for online-only mode
  return;
};
export const isDbOperational = async (..._args: any[]) => {
  return false;
};
export const getDb = async (..._args: any[]) => {
  return null;
};

export const addLocalEntry = async (..._args: any[]) => {
  return null;
};
export const getEntries = async (..._args: any[]): Promise<any[]> => {
  return [];
};
export const updateLocalEntry = async (..._args: any[]) => {
  return null;
};
export const markEntryDeleted = async (..._args: any[]) => {
  return null;
};
export const markEntrySynced = async (..._args: any[]) => {
  return null;
};
export const getEntryByLocalId = async (..._args: any[]): Promise<any | null> => null;
export const getLocalByRemoteId = async (..._args: any[]): Promise<any | null> => null;
export const upsertLocalFromRemote = async (..._args: any[]) => {
  return null;
};
export const getLocalByClientId = async (..._args: any[]): Promise<any | null> => null;
export const getUnsyncedEntries = async (..._args: any[]): Promise<any[]> => [];

// eslint-disable-next-line require-yield
export const fetchEntriesGenerator = async function* (
  ..._args: any[]
): AsyncGenerator<any, void, unknown> {
  // yields nothing in online-only mode
  return;
};

export const getSummary = async (..._args: any[]): Promise<any | null> => {
  // Try to read precomputed summaries from Neon when running in online-only mode.
  try {
    // lazy require to avoid circular imports at module init
    const { query } = require('../api/neonClient');
    const session = await getSession();
    const userId = session?.id;
    if (!userId) return null;

    // daily key is YYYY-MM-DD
    if (_args.length >= 2 && _args[0] === 'daily') {
      const key = _args[1];
      try {
        const rows = await query(
          'SELECT total_in, total_out, count FROM daily_summaries WHERE user_id = $1 AND date = $2 LIMIT 1',
          [userId, key]
        );
        const r = rows && rows[0];
        if (!r) return null;
        return {
          totalInCents: Math.round(Number(r.total_in || 0) * 100),
          totalOutCents: Math.round(Number(r.total_out || 0) * 100),
          count: Number(r.count || 0),
        };
      } catch (e) {
        console.warn('Failed to query daily_summaries', e);
        return null;
      }
    }
    // monthly key is YYYY-MM or YYYY-MM-01 etc.
    if (_args.length >= 2 && _args[0] === 'monthly') {
      const key = _args[1];
      try {
        // Parse year/month
        const m = String(key).split('-');
        const year = Number(m[0]);
        const month = Number(m[1]);
        if (!year || !month) return null;
        const rows = await query(
          'SELECT total_in, total_out, count FROM monthly_summaries WHERE user_id = $1 AND year = $2 AND month = $3 LIMIT 1',
          [userId, year, month]
        );
        const r = rows && rows[0];
        if (!r) return null;
        return {
          totalInCents: Math.round(Number(r.total_in || 0) * 100),
          totalOutCents: Math.round(Number(r.total_out || 0) * 100),
          count: Number(r.count || 0),
        };
      } catch (e) {
        console.warn('Failed to query monthly_summaries', e);
        return null;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const getSummaries = async (
  period: 'daily' | 'monthly',
  start: string,
  end: string
): Promise<any[] | null> => {
  try {
    const { query } = require('../api/neonClient');
    const session = await getSession();
    const userId = session?.id;
    if (!userId) return null;

    if (period === 'daily') {
      // expecting start/end as YYYY-MM-DD
      const rows = await query(
        'SELECT date, total_in, total_out, count FROM daily_summaries WHERE user_id = $1 AND date >= $2::date AND date <= $3::date ORDER BY date',
        [userId, start, end]
      );
      return rows || [];
    }

    if (period === 'monthly') {
      // expecting start/end as YYYY-MM (use first day of month)
      const rows = await query(
        `SELECT year, month, total_in, total_out, count FROM monthly_summaries WHERE user_id = $1 AND (year > $2 OR (year = $2 AND month >= $3)) AND (year < $4 OR (year = $4 AND month <= $5)) ORDER BY year, month`,
        [
          userId,
          Number(start.split('-')[0]),
          Number(start.split('-')[1]),
          Number(end.split('-')[0]),
          Number(end.split('-')[1]),
        ]
      );
      return rows || [];
    }

    return null;
  } catch (e) {
    return null;
  }
};

export const addPendingProfileUpdate = async (..._args: any[]) => {
  return null;
};
export const getPendingProfileUpdates = async (..._args: any[]): Promise<any[]> => [];
export const markPendingProfileProcessed = async (..._args: any[]) => {
  return null;
};

export const queueRemoteRow = async (..._args: any[]) => {
  // disabled: do not persist remote rows in AsyncStorage
  return null;
};
export const getQueuedRemoteRows = async (..._args: any[]) => [];
export const removeQueuedRemoteRow = async (..._args: any[]) => {
  return null;
};
export const flushQueuedRemoteRows = async (..._args: any[]) => {
  return { processed: 0 };
};
export const queueLocalRemoteMapping = async (..._args: any[]) => {
  return null;
};
export const getQueuedLocalRemoteMappings = async (..._args: any[]) => [];
export const removeQueuedLocalRemoteMapping = async (..._args: any[]) => {
  return null;
};
export const flushQueuedLocalRemoteMappings = async (..._args: any[]) => {
  return { processed: 0 };
};

export const flushFallbackLocalEntries = async (..._args: any[]) => ({ processed: 0 });

export const clearAllData = async (..._args: any[]) => {
  return null;
};
export const wipeLocalDatabase = async (..._args: any[]) => {
  return null;
};

// Provide compat exports for session helpers (redirect to session module)
import * as session from './session';
export const getSession = session.getSession;
export const saveSession = session.saveSession;
export const clearSession = session.clearSession;

export const deleteLocalEntry = async (..._args: any[]) => {
  return null;
};

export default {
  init,
  getDb,
  addLocalEntry,
  getEntries,
  updateLocalEntry,
  markEntryDeleted,
  markEntrySynced,
  getEntryByLocalId,
  getLocalByRemoteId,
  upsertLocalFromRemote,
  getUnsyncedEntries,
  fetchEntriesGenerator,
  getSummary,
  addPendingProfileUpdate,
  getPendingProfileUpdates,
  markPendingProfileProcessed,
  queueRemoteRow,
  getQueuedRemoteRows,
  removeQueuedRemoteRow,
  queueLocalRemoteMapping,
  getQueuedLocalRemoteMappings,
  removeQueuedLocalRemoteMapping,
  flushQueuedRemoteRows,
  flushQueuedLocalRemoteMappings,
  flushFallbackLocalEntries,
  clearAllData,
  wipeLocalDatabase,
  isDbOperational,
  getSession,
  saveSession,
  clearSession,
  deleteLocalEntry,
};
