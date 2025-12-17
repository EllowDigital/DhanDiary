#!/usr/bin/env node
const admin = require('firebase-admin');
const argv = require('minimist')(process.argv.slice(2));

const LIMIT_USERS = Number(argv.limit || 0); // 0 = unlimited
const PER_USER_DOCS = Number(argv.perUser || 1000);
const SAMPLE_LIMIT = 5;

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.warn('Warning: GOOGLE_APPLICATION_CREDENTIALS not set. Ensure you have application default credentials.');
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

async function audit() {
  console.log('Starting Firestore audit');
  const batchUsers = 200;
  let lastUser = null;
  let usersChecked = 0;

  const stats = {
    usersScanned: 0,
    entriesScanned: 0,
    missingU: 0,
    nonNumericUpdatedAt: 0,
    missingA: 0,
    emptyStrings: 0,
    samples: {
      missingU: [],
      nonNumericUpdatedAt: [],
      missingA: [],
      emptyStrings: [],
    },
  };

  outer: while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(batchUsers);
    if (lastUser) q = q.startAfter(lastUser);
    const usnap = await q.get();
    if (usnap.empty) break;
    for (const udoc of usnap.docs) {
      const uid = udoc.id;
      usersChecked += 1;
      stats.usersScanned = usersChecked;

      // limit users
      if (LIMIT_USERS && usersChecked > LIMIT_USERS) break outer;

      // fetch entries for this user
      const col = db.collection('users').doc(uid).collection('cash_entries').limit(PER_USER_DOCS);
      const snap = await col.get();
      for (const doc of snap.docs) {
        stats.entriesScanned += 1;
        const data = doc.data() || {};
        const docId = `${uid}/${doc.id}`;

        // missing compressed 'u'
        if (!('u' in data)) {
          stats.missingU += 1;
          if (stats.samples.missingU.length < SAMPLE_LIMIT) stats.samples.missingU.push(docId);
        }

        // non-numeric updatedAt (if present as updatedAt)
        if ('updatedAt' in data && typeof data.updatedAt !== 'number') {
          stats.nonNumericUpdatedAt += 1;
          if (stats.samples.nonNumericUpdatedAt.length < SAMPLE_LIMIT)
            stats.samples.nonNumericUpdatedAt.push(docId);
        }

        // missing a (cents)
        if (!('a' in data) || typeof data.a !== 'number' || !Number.isInteger(data.a)) {
          stats.missingA += 1;
          if (stats.samples.missingA.length < SAMPLE_LIMIT) stats.samples.missingA.push(docId);
        }

        // any empty strings on top-level fields
        for (const k of Object.keys(data)) {
          if (typeof data[k] === 'string' && data[k].length === 0) {
            stats.emptyStrings += 1;
            if (stats.samples.emptyStrings.length < SAMPLE_LIMIT) stats.samples.emptyStrings.push(docId + '#' + k);
            break;
          }
        }
      }
    }

    if (usnap.docs.length < batchUsers) break;
    lastUser = usnap.docs[usnap.docs.length - 1];
  }

  // Summary
  console.log('\n==== Audit Summary ====');
  console.log('Users scanned:', stats.usersScanned);
  console.log('Entries scanned:', stats.entriesScanned);
  console.log('Missing compressed u:', stats.missingU);
  console.log('Non-numeric updatedAt:', stats.nonNumericUpdatedAt);
  console.log('Missing or non-integer a (cents):', stats.missingA);
  console.log('Entries with empty strings:', stats.emptyStrings);

  const showSamples = (label, arr) => {
    if (arr && arr.length) {
      console.log(`\nSamples for ${label}:`);
      for (const s of arr) console.log(' -', s);
    }
  };

  showSamples('missing u', stats.samples.missingU);
  showSamples('non-numeric updatedAt', stats.samples.nonNumericUpdatedAt);
  showSamples('missing a', stats.samples.missingA);
  showSamples('empty strings', stats.samples.emptyStrings);

  // PASS/WARN/ERROR logic
  const totalErrors = stats.missingU + stats.nonNumericUpdatedAt + stats.missingA + stats.emptyStrings;
  let status = 'PASS';
  if (totalErrors === 0) status = 'PASS';
  else if (totalErrors > 0 && totalErrors <= 100) status = 'WARN';
  else status = 'ERROR';

  console.log('\nRESULT:', status);
  if (status === 'PASS') console.log('All documents conform to the sync contract.');
  else if (status === 'WARN')
    console.log('Minor issues detected. Consider targeted fixes or a migration for affected docs.');
  else
    console.log('Significant issues detected. Plan a migration / rollback of writes to fix inconsistencies.');

  process.exit(status === 'PASS' ? 0 : 2);
}

audit().catch((err) => {
  console.error('Audit failed', err);
  process.exit(3);
});
