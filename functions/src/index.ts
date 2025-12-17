import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import dayjs from 'dayjs';

admin.initializeApp();
const db = admin.firestore();

// Helpers
const toCents = (v: any) => {
  const n = Number(v) || 0;
  return Math.round(n * 100);
};

const ymd = (iso: string | undefined | null) => {
  if (!iso) return null;
  const d = dayjs(iso);
  if (!d.isValid()) return null;
  return {
    day: d.format('YYYY-MM-DD'),
    month: d.format('YYYY-MM'),
    year: d.format('YYYY'),
  };
};

// Update a summary doc by increments (idempotent per-run when applied correctly).
async function applyIncrements(tx: admin.firestore.Transaction, docRef: admin.firestore.DocumentReference, increments: { inCents?: number; outCents?: number; count?: number }) {
  const snap = await tx.get(docRef);
  const now = admin.firestore.FieldValue.serverTimestamp();
  if (!snap.exists) {
    const base: any = {
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

  const updates: any = { updatedAt: now };
  if (increments.inCents) updates.totalInCents = admin.firestore.FieldValue.increment(increments.inCents);
  if (increments.outCents) updates.totalOutCents = admin.firestore.FieldValue.increment(increments.outCents);
  if (increments.count) updates.count = admin.firestore.FieldValue.increment(increments.count);
  tx.update(docRef, updates);
}

// Main trigger: onWrite for cash_entries
export const onEntryWrite = functions.firestore
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
    const ops: Array<{ collectionPath: string; key: string; inCents: number; outCents: number; count: number }> = [];

    if (!before && after) {
      // Create
      if (afterDate) {
        ops.push({ collectionPath: 'daily', key: afterDate.day, inCents: afterIn, outCents: afterOut, count: 1 });
        ops.push({ collectionPath: 'monthly', key: afterDate.month, inCents: afterIn, outCents: afterOut, count: 1 });
        ops.push({ collectionPath: 'yearly', key: afterDate.year, inCents: afterIn, outCents: afterOut, count: 1 });
      }
    } else if (before && after) {
      // Update
      // Same bucket
      if (beforeDate && afterDate && beforeDate.day === afterDate.day) {
        const inDelta = afterIn - beforeIn;
        const outDelta = afterOut - beforeOut;
        if (inDelta !== 0 || outDelta !== 0) {
          ops.push({ collectionPath: 'daily', key: afterDate.day, inCents: inDelta, outCents: outDelta, count: 0 });
          ops.push({ collectionPath: 'monthly', key: afterDate.month, inCents: inDelta, outCents: outDelta, count: 0 });
          ops.push({ collectionPath: 'yearly', key: afterDate.year, inCents: inDelta, outCents: outDelta, count: 0 });
        }
      } else {
        // Moved date or bucket changed: decrement old, increment new
        if (beforeDate) ops.push({ collectionPath: 'daily', key: beforeDate.day, inCents: -beforeIn, outCents: -beforeOut, count: -1 });
        if (beforeDate) ops.push({ collectionPath: 'monthly', key: beforeDate.month, inCents: -beforeIn, outCents: -beforeOut, count: -1 });
        if (beforeDate) ops.push({ collectionPath: 'yearly', key: beforeDate.year, inCents: -beforeIn, outCents: -beforeOut, count: -1 });

        if (afterDate) ops.push({ collectionPath: 'daily', key: afterDate.day, inCents: afterIn, outCents: afterOut, count: 1 });
        if (afterDate) ops.push({ collectionPath: 'monthly', key: afterDate.month, inCents: afterIn, outCents: afterOut, count: 1 });
        if (afterDate) ops.push({ collectionPath: 'yearly', key: afterDate.year, inCents: afterIn, outCents: afterOut, count: 1 });
      }
    } else if (before && !after) {
      // Delete
      if (beforeDate) {
        ops.push({ collectionPath: 'daily', key: beforeDate.day, inCents: -beforeIn, outCents: -beforeOut, count: -1 });
        ops.push({ collectionPath: 'monthly', key: beforeDate.month, inCents: -beforeIn, outCents: -beforeOut, count: -1 });
        ops.push({ collectionPath: 'yearly', key: beforeDate.year, inCents: -beforeIn, outCents: -beforeOut, count: -1 });
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
