// Cloud Functions code removed — project is offline-only.
// This module used to export Firebase Cloud Function handlers.
// It has been neutralized to avoid referencing Firebase in an offline-only project.

exports.onEntryWrite = () => {
  console.log('onEntryWrite disabled: Cloud Functions removed');
};

exports.backfillSummaries = () => {
  console.log('backfillSummaries disabled: Cloud Functions removed');
};
// Update a summary doc by increments (idempotent per-run when applied correctly).
async function applyIncrements(tx, docRef, increments) {
  const snap = await tx.get(docRef);
  const now = admin.firestore.FieldValue.serverTimestamp();
  if (!snap.exists) {
    const base = {
      totalInCents: 0,
      totalOutCents: 0,
      count: 0,
      updatedAt: now,
    };
    if (increments.inCents) base.totalInCents = increments.inCents;
    if (increments.outCents) base.totalOutCents = increments.outCents;
    if (increments.count) base.count = increments.count;
    tx.set(docRef, base, { merge: true });
    return;
  }
  const updates = { updatedAt: now };
  if (increments.inCents)
    updates.totalInCents = admin.firestore.FieldValue.increment(increments.inCents);
  if (increments.outCents)
    updates.totalOutCents = admin.firestore.FieldValue.increment(increments.outCents);
  if (increments.count) updates.count = admin.firestore.FieldValue.increment(increments.count);
  tx.update(docRef, updates);
}
// Main trigger: onWrite for cash_entries
exports.onEntryWrite = functions.firestore
  .document('users/{uid}/cash_entries/{entryId}')
  .onWrite(async (change, context) => {
    const { uid, entryId } = context.params;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    // Compute deltas
    // For in/out we store cents as integers
    const beforeDate = before ? ymd(before.date || before.createdAt) : null;
    const afterDate = after ? ymd(after.date || after.createdAt) : null;
    const beforeIn = before && before.type === 'in' ? toCents(before.amount) : 0;
    const beforeOut = before && before.type === 'out' ? toCents(before.amount) : 0;
    const afterIn = after && after.type === 'in' ? toCents(after.amount) : 0;
    const afterOut = after && after.type === 'out' ? toCents(after.amount) : 0;
    // Delta per key
    // We'll produce operations for up to two buckets (old and new)
    const ops = [];
    if (!before && after) {
      // Create
      if (afterDate) {
        ops.push({
          collectionPath: 'daily',
          key: afterDate.day,
          inCents: afterIn,
          outCents: afterOut,
          count: 1,
        });
        ops.push({
          collectionPath: 'monthly',
          key: afterDate.month,
          inCents: afterIn,
          outCents: afterOut,
          count: 1,
        });
        ops.push({
          collectionPath: 'yearly',
          key: afterDate.year,
          inCents: afterIn,
          outCents: afterOut,
          count: 1,
        });
      }
    } else if (before && after) {
      // Update
      // Same bucket
      if (beforeDate && afterDate && beforeDate.day === afterDate.day) {
        const inDelta = afterIn - beforeIn;
        const outDelta = afterOut - beforeOut;
        if (inDelta !== 0 || outDelta !== 0) {
          ops.push({
            collectionPath: 'daily',
            key: afterDate.day,
            inCents: inDelta,
            outCents: outDelta,
            count: 0,
          });
          ops.push({
            collectionPath: 'monthly',
            key: afterDate.month,
            inCents: inDelta,
            outCents: outDelta,
            count: 0,
          });
          ops.push({
            collectionPath: 'yearly',
            key: afterDate.year,
            inCents: inDelta,
            outCents: outDelta,
            count: 0,
          });
        }
      } else {
        // Moved date or bucket changed: decrement old, increment new
        if (beforeDate)
          ops.push({
            collectionPath: 'daily',
            key: beforeDate.day,
            inCents: -beforeIn,
            outCents: -beforeOut,
            count: -1,
          });
        if (beforeDate)
          ops.push({
            collectionPath: 'monthly',
            key: beforeDate.month,
            inCents: -beforeIn,
            outCents: -beforeOut,
            count: -1,
          });
        if (beforeDate)
          ops.push({
            collectionPath: 'yearly',
            key: beforeDate.year,
            inCents: -beforeIn,
            outCents: -beforeOut,
            count: -1,
          });
        if (afterDate)
          ops.push({
            collectionPath: 'daily',
            key: afterDate.day,
            inCents: afterIn,
            outCents: afterOut,
            count: 1,
          });
        if (afterDate)
          ops.push({
            collectionPath: 'monthly',
            key: afterDate.month,
            inCents: afterIn,
            outCents: afterOut,
            count: 1,
          });
        if (afterDate)
          ops.push({
            collectionPath: 'yearly',
            key: afterDate.year,
            inCents: afterIn,
            outCents: afterOut,
            count: 1,
          });
      }
    } else if (before && !after) {
      // Delete
      if (beforeDate) {
        ops.push({
          collectionPath: 'daily',
          key: beforeDate.day,
          inCents: -beforeIn,
          outCents: -beforeOut,
          count: -1,
        });
        ops.push({
          collectionPath: 'monthly',
          key: beforeDate.month,
          inCents: -beforeIn,
          outCents: -beforeOut,
          count: -1,
        });
        ops.push({
          collectionPath: 'yearly',
          key: beforeDate.year,
          inCents: -beforeIn,
          outCents: -beforeOut,
          count: -1,
        });
      }
    }
    if (ops.length === 0) return null;
    // Apply transactionally
    try {
      await db.runTransaction(async (tx) => {
        for (const op of ops) {
          const docRef = db.doc(`users/${uid}/summaries/${op.collectionPath}/items/${op.key}`);
          await applyIncrements(tx, docRef, {
            inCents: op.inCents !== 0 ? op.inCents : undefined,
            outCents: op.outCents !== 0 ? op.outCents : undefined,
            count: op.count !== 0 ? op.count : undefined,
          });
        }
      });
    } catch (err) {
      console.error('Failed to apply summary increments', err);
      throw err;
    }
    return null;
  });
// Backfill summaries (idempotent): scans users and their cash_entries and writes period summaries.
// Trigger: HTTPS request with secret or via local emulator.
// Environment: set BACKFILL_SECRET in functions config or env for protection.
exports.backfillSummaries = functions.https.onRequest(async (req, res) => {
  const secret = process.env.BACKFILL_SECRET || functions.config().backfill?.secret;
  const provided =
    req.query.secret || req.header('x-backfill-secret') || (req.body && req.body.secret);
  const allowLocal = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.FIREBASE_EMULATOR_HUB; // allow emulator
  if (!allowLocal && secret && provided !== secret) {
    res.status(403).send('Forbidden');
    return;
  }
  const targetUid = req.query.uid || (req.body && req.body.uid);
  const pageSize = Number(req.query.pageSize || req.body?.pageSize || 200);
  // helper to write map -> batched sets (idempotent: sets absolute totals)
  async function writeSummaryMaps(uid, period, map) {
    const entries = Array.from(map.entries());
    const batchLimit = 450; // under 500
    for (let i = 0; i < entries.length; i += batchLimit) {
      const batch = db.batch();
      const slice = entries.slice(i, i + batchLimit);
      for (const [key, val] of slice) {
        const docRef = db.doc(`users/${uid}/summaries/${period}/items/${key}`);
        batch.set(
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
