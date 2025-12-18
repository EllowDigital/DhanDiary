// Cloud Functions have been removed for offline-only build.
// This file is intentionally a neutral stub to avoid any Firebase/Admin references
// or runtime side-effects. Keep a minimal export so tooling that imports this
// path will not fail.

export const onEntryWrite = () => {
  // disabled
};

export const backfillSummaries = () => {
  // disabled
};
          docRef,
          {
            totalInCents: val.inCents,
            totalOutCents: val.outCents,
            count: val.count,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
    }
  }
  async function processUser(uid) {
    const daily = new Map();
    const monthly = new Map();
    const yearly = new Map();
    let last = null;
    while (true) {
      let q = db.collection(`users/${uid}/cash_entries`).orderBy('createdAt').limit(pageSize);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        last = doc;
        const data = doc.data();
        const when = ymd(data.date || data.createdAt);
        if (!when) continue;
        const inC = data.type === 'in' ? toCents(data.amount) : 0;
        const outC = data.type === 'out' ? toCents(data.amount) : 0;
        const addTo = (map, key) => {
          const cur = map.get(key);
          if (cur) {
            cur.inCents += inC;
            cur.outCents += outC;
            cur.count += 1;
          } else {
            map.set(key, { inCents: inC, outCents: outC, count: 1 });
          }
        };
        addTo(daily, when.day);
        addTo(monthly, when.month);
        addTo(yearly, when.year);
      }
      if (snap.size < pageSize) break;
    }
    // write summaries as absolute totals (idempotent)
    await writeSummaryMaps(uid, 'daily', daily);
    await writeSummaryMaps(uid, 'monthly', monthly);
    await writeSummaryMaps(uid, 'yearly', yearly);
  }
  try {
    if (targetUid) {
      await processUser(targetUid);
      res.status(200).send({ ok: true, processed: targetUid });
      return;
    }
    // iterate users in pages
    let lastUser = null;
    let processed = 0;
    while (true) {
      let uq = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(200);
      if (lastUser) uq = uq.startAfter(lastUser);
      const usnap = await uq.get();
      if (usnap.empty) break;
      for (const udoc of usnap.docs) {
        lastUser = udoc;
        const uid = udoc.id;
        await processUser(uid);
        processed += 1;
      }
      if (usnap.size < 200) break;
    }
    res.status(200).send({ ok: true, processed });
  } catch (err) {
    console.error('Backfill error', err);
    res.status(500).send({ ok: false, error: String(err) });
  }
});
