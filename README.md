# DhanDiary

A React Native (Expo) expense tracker with offline-first capabilities and NeonDB sync.

## Setup

1.  Clone repository.
2.  Install dependencies: `npm install`
3.  Create `.env` file with your NeonDB connection string:
    ```
    NEON_URL=postgres://user:password@host/dbname?sslmode=require
    ```
4.  Run app: `npx expo start`

## Analytics (Vexo)

This project supports Vexo analytics. Vexo requires native code and therefore works with development builds or bare React Native (not Expo Go).

1. Create an account at Vexo and get an API key.
2. Install the package:

```bash
npm install vexo-analytics
# or
yarn add vexo-analytics
```

3. Provide the key to your app using an environment variable or `app.json` extra (recommended for EAS):

```env
VEXO_API_KEY=your_key_here
```

4. The app initializes Vexo automatically in production builds if `VEXO_API_KEY` is set.

## Features

- **Authentication**: Online-only (Login/Register).
- **Offline-First**: Add expenses/income offline. stored in local SQLite.
- **Sync**: Automatically syncs local entries to NeonDB when internet is available.
- **NeonDB**: Serverless Postgres for cloud storage.

## Offline / Online Rules

- Write operations (Add/Edit/Delete) always write to the local SQLite database immediately.
- Entries are marked `is_synced = 0` after local changes; the background sync manager uploads unsynced rows to NeonDB when internet is available.
- Deletions are soft: the app marks `is_deleted = 1` locally and the sync manager propagates deletions to the remote DB. A later purge/cleanup can remove fully deleted rows.
- Authentication (Register/Login) is online-only — you must be connected to register or login the first time. After login the app operates offline with local session stored.

## Settings & About

- **Settings**: `Sync Now`, `Clear Local Data`, `Logout` are available under Settings. `Sync Now` triggers an immediate upload of unsynced entries to Neon (requires `NEON_URL` configured).
- **About**: Shows developer, organization, and the current app version.

## Architecture

- **Frontend**: React Native (Expo), TypeScript, React Query, React Native Elements.
- **Local DB**: Expo SQLite.
- **Remote DB**: Neon (Postgres).
- **Sync**: Custom sync manager in `src/services/syncManager.ts`.

## Testing

Run `npm test` to execute Jest tests.

## Build / Migrate

- To apply the remote schema to Neon (requires `NEON_URL` in `.env`):

```powershell
npm run migrate
```

## Notes

- If you run into peer dependency issues during `npm install`, use `npm install --legacy-peer-deps` as a temporary workaround.
- If you want transactions to have an explicit user-editable date (separate from `created_at`), add an `entry_date` column to the local and remote schemas.
