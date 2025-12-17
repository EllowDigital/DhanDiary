# Sync Staging Checklist

Purpose

- Validate Firestore rules and client sync behavior before production deploy.
- Run after any `firestore.rules` change and before shipping to production.

When to run

- Immediately after deploying `firestore.rules` to the staging project.
- After any change to the sync engine, serialization format (compressed vs full), or auth rules.

1. Rules Simulator tests (Firestore Console → Rules → Simulator)

- Setup: simulate requests as authenticated user where `request.auth.uid == uid` (use the same `uid` value used for the doc path).

Test A — Valid compressed write (should ALLOW)

- Operation: `create` or `update` on `/users/{uid}/cash_entries/{entryId}`
- Payload example:

```json
{
  "i": "entryId",
  "a": 12345,
  "c": "groceries",
  "n": "shopping",
  "t": "out",
  "cu": "INR",
  "d": "2025-12-18T00:00:00.000Z",
  "u": 1730000000000,
  "di": "device-uuid",
  "del": false
}
```

- Expect: ALLOW

Test B — Missing numeric timestamp (should DENY)

- Payload: same as above but `u` missing and `updatedAt` is a string

```json
{ "updatedAt": "2025-12-18T00:00:00Z" }
```

- Expect: DENY

Test C — `i` mismatches document id (should DENY)

- Write to doc id `entry123` with `i: "otherId"`
- Expect: DENY

Test D — Oversized `note` (should DENY)

- Set `note` to a string > 4096 chars
- Expect: DENY

Test E — Aggregate field injection (should DENY)

- Include `totalInCents` or `count` in payload
- Expect: DENY

Test F — Hard delete attempt (should DENY)

- Simulate `delete` operation on `/users/{uid}/cash_entries/{entryId}`
- Expect: DENY (soft-delete must be an update setting `del`/`isDeleted`)

2. On-device staging tests (use staging build / emulator)

- Ensure app is authenticated as the same `uid` used in Simulator.

Test 1 — Push valid compressed payload

- Action: create an entry locally and sync (should push `u` and `a` fields)
- Expect: success; document visible in Console with numeric `u`/`a` (or decompressed equivalents)

Test 2 — Push invalid payload (missing numeric timestamp)

- Induce a bad client (or craft request via REST) that omits numeric `u` and uses string `updatedAt`
- Expect: server rejects; client should log rejection and apply backoff. Document not created.

Test 3 — Soft delete flow

- Action: perform a delete in the app; client must send an `update` setting `del` or `isDeleted` = true with numeric `u`
- Expect: document remains in Firestore with `del`/`isDeleted` true; no delete operation in console.

Test 4 — Normal sync resumes

- After valid and invalid attempts, run `runSyncOnce()` or let auto-sync run
- Expect: valid entries synced; invalid writes rejected; aggregates remain correct locally.

3. Expected outcomes (PASS criteria)

- Rules Simulator: all ALLOW/DENY behaviors match the tests above.
- Staging device: valid pushes are accepted; invalid pushes are rejected; client handles rejections gracefully (backoff/log).
- Soft deletes present as field updates in Firestore, no hard deletes.
- No aggregate fields appear in Firestore documents.

4. Failure diagnosis (where to look)

- If a valid write is rejected:
  - Check rules syntax (Simulator shows failing condition).
  - Confirm `u` or `updatedAt` is numeric in the client payload.
- If an invalid write is accepted:
  - Inspect deployed rules (file may not have been deployed correctly).
  - Check for alternate code paths using Admin SDK (server-side writes bypass rules).
- If deletions appear as hard deletes:
  - Inspect client code path for delete vs update; ensure `remove` sends an update with `isDeleted=true`.

5. Troubleshooting notes

- Rules Simulator string length helpers differ by runtime: `size()` or `length()` — use the one accepted in your console. If simulator errors, try swapping `.size()` with `.length()`.
- To inspect rule rejections in production/staging, use Cloud Logging (enable Firestore logging) or add client-side error capture to report rule rejections.
- If many clients fail after rule deployment, revert rules quickly to previous version and investigate (use `firebase deploy --only firestore:rules` with backup).

6. Commands

- Deploy rules:

```bash
npx firebase deploy --only firestore:rules
```

7. Required sign-off

- Only mark as PASS when all Simulator and on-device tests pass.
- Keep this checklist with repo as mandatory gating before any `firestore.rules` change to `main`/`prod`.

---

Addendum: if you want, I can also commit a small test script (Node) that runs a few example requests against your emulator or staging project to automate these checks. Say `yes` to add that script.
