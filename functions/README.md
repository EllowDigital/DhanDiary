# DhanDiary Cloud Functions

This folder contains Cloud Functions to maintain per-user transaction summaries (daily/monthly/yearly) in Firestore.

Why

- Keeps analytics lightweight on clients by precomputing aggregates server-side.
- Uses Firestore transactions and increments to be resilient and atomic.

Files

- `src/index.ts` - main function triggered on `users/{uid}/cash_entries/{entryId}` writes.

Deploy

1. Install dependencies in `functions` folder:

```bash
cd functions
npm install
```

2. Build and deploy (requires Firebase CLI and project configured):

```bash
npm run build
firebase deploy --only functions
```

Firestore security notes

- Functions use the Admin SDK and run with admin privileges. Ensure your Firestore rules still protect client access appropriately (clients should not be able to write to `users/{uid}/summaries/*` directly).
- For best practices, restrict client rules so summaries are only readable by the owning user and not writable.

Idempotency and retries

- The function computes deltas (after - before) and applies them in a transaction. Cloud Functions retries only on failure, so successful runs won't be retried.
- If you need absolute deduplication for partial-failure edge cases, consider storing a processed-event idempotency token on the entry doc and checking it in the transaction.
