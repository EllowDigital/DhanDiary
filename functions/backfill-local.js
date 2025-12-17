#!/usr/bin/env node
const admin = require('firebase-admin');
const dayjs = require('dayjs');
const argv = require('minimist')(process.argv.slice(2));

// Usage: node backfill-local.js --uid=USER_ID --pageSize=200
// Ensure GOOGLE_APPLICATION_CREDENTIALS env var points to a service account JSON

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.warn(
    'Warning: GOOGLE_APPLICATION_CREDENTIALS not set. Ensure you have application default credentials.'
  );
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});
const db = admin.firestore();

const toCents = (v) => {
  const n = Number(v) || 0;
  return Math.round(n * 100);
};

const ymd = (iso) => {
  if (!iso) return null;
  const d = dayjs(iso);
  if (!d.isValid()) return null;
  return {
    day: d.format('YYYY-MM-DD'),
    month: d.format('YYYY-MM'),
    year: d.format('YYYY'),
  };
};

async function writeSummaryMaps(uid, period, map) {
  const entries = Array.from(map.entries());
  const batchLimit = 450;
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

async function processUser(uid, pageSize) {
  console.log('Processing user', uid);
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
  await writeSummaryMaps(uid, 'daily', daily);
  await writeSummaryMaps(uid, 'monthly', monthly);
  await writeSummaryMaps(uid, 'yearly', yearly);
}

(async () => {
  try {
    const pageSize = Number(argv.pageSize || 200);
    const uid = argv.uid;
    if (uid) {
      await processUser(uid, pageSize);
      console.log('Done for user', uid);
      process.exit(0);
    }

    console.log('Processing all users');
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
        await processUser(uid, pageSize);
        processed += 1;
        console.log('Processed users', processed);
      }
      if (usnap.size < 200) break;
    }
    console.log('Backfill complete, users processed:', processed);
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed', err);
    process.exit(2);
  }
})();
