import sqlite from '../db/sqlite';

type Report = {
  groupsProcessed: number;
  totalCandidates: number;
  removed: number;
  details: Array<{ key: string; kept: string; removed: string[] }>;
};

/**
 * Merge / deduplicate local-only rows in `local_entries`.
 * Criteria: rows where `remote_id` is null/empty and `is_deleted = 0`.
 * Grouping key: `type|amount|date|category|note` (trimmed).
 * Keep the row with the newest `updated_at` and remove others.
 *
 * NOTE: This runs inside the app (uses expo-sqlite) and mutates the DB.
 */
export const cleanupDuplicateLocalEntries = async (opts?: { dryRun?: boolean }) => {
  const dryRun = !!(opts && opts.dryRun);
  const db = await sqlite.open();

  const rows = await db.all<{
    local_id: string;
    remote_id?: string | null;
    amount: number;
    category?: string | null;
    note?: string | null;
    type: string;
    date?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }>(
    `SELECT local_id, remote_id, amount, category, note, type, date, created_at, updated_at FROM local_entries WHERE (remote_id IS NULL OR remote_id = '') AND is_deleted = 0`
  );

  const map: Record<string, typeof rows> = {};
  for (const r of rows) {
    const key = [
      r.type || '',
      Number(r.amount || 0).toFixed(2),
      r.date || '',
      (r.category || '').trim(),
      (r.note || '').trim(),
    ].join('|');
    if (!map[key]) map[key] = [];
    map[key].push(r as any);
  }

  const details: Report['details'] = [];
  let totalCandidates = 0;
  let removed = 0;

  for (const key of Object.keys(map)) {
    const group = map[key];
    if (group.length <= 1) continue;
    totalCandidates += group.length;

    // choose the row to keep: newest updated_at (fallback to created_at)
    let best = group[0];
    const parseTime = (s?: string | null) => (s ? new Date(s).getTime() : 0);
    for (const g of group) {
      if (parseTime(g.updated_at) > parseTime(best.updated_at)) best = g;
    }

    const toRemove = group.filter((g) => g.local_id !== best.local_id).map((g) => g.local_id);
    details.push({ key, kept: best.local_id, removed: toRemove });

    if (!dryRun) {
      for (const id of toRemove) {
        try {
          await db.run('DELETE FROM local_entries WHERE local_id = ?', [id]);
          removed += 1;
        } catch (e) {
          // ignore individual failures but note them in details
        }
      }
    } else {
      removed += toRemove.length;
    }
  }

  return {
    groupsProcessed: details.length,
    totalCandidates,
    removed,
    details,
  } as Report;
};

export default cleanupDuplicateLocalEntries;
