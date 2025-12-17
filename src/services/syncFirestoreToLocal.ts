import { fetchEntries as fetchRemoteEntries, fetchEntriesGenerator } from './firestoreEntries';
import { createEntry, getEntries } from './localDb';
import { LocalEntry } from '../types/entries';

export async function syncFirestoreToLocalOnce(userId: string) {
  if (!userId) return;
  try {
    console.info('[sync] starting Firestore -> local sync for', userId);
    const local = await getEntries(userId);
    const existing = new Set(local.map((l) => l.local_id));

    // Prefer generator if available to avoid large memory spikes
    if (typeof fetchEntriesGenerator === 'function') {
      let added = 0;
      for await (const page of fetchEntriesGenerator(userId)) {
        for (const doc of page) {
          if (existing.has(doc.local_id)) continue;
          await createEntry(userId, {
            local_id: doc.local_id,
            amount: doc.amount,
            category: doc.category,
            note: doc.note ?? null,
            type: doc.type,
            currency: doc.currency,
            date: doc.date,
          });
          added += 1;
        }
      }
      console.info('[sync] completed pages; added', added, 'new entries');
      return;
    }

    // Fallback to fetching all
    const remote = await fetchRemoteEntries(userId);
    let added = 0;
    for (const doc of remote) {
      if (existing.has(doc.local_id)) continue;
      await createEntry(userId, {
        local_id: doc.local_id,
        amount: doc.amount,
        category: doc.category,
        note: doc.note ?? null,
        type: doc.type,
        currency: doc.currency,
        date: doc.date,
      });
      added += 1;
    }
    console.info('[sync] fetched', remote.length, 'remote, added', added);
  } catch (e) {
    console.warn('syncFirestoreToLocalOnce failed', e);
  }
}

export default syncFirestoreToLocalOnce;
