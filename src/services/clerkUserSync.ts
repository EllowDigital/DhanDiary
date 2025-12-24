import { v4 as uuidv4 } from 'uuid';
import { query } from '../api/neonClient';
import { saveSession } from '../db/localDb';

/*
  The Bridge Service:
  Connects Clerk Identities (external) to Internal Postgres UUIDs.
  Handles atomic merging of legacy email users with new Clerk logins.
*/

export interface BridgeUser {
  uuid: string; // The internal DB ID used for Foreign Keys
  clerk_id: string;
  email: string;
  name: string | null;
  server_version: number;
}

// Internal DB Row Interface
interface DbUser {
  id: string;
  clerk_id: string;
  email: string;
  name: string | null;
}

export const syncClerkUserToNeon = async (clerkUser: {
  id: string;
  emailAddresses: { emailAddress: string }[];
  fullName?: string | null;
}): Promise<BridgeUser> => {
  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error('Clerk user must have an email');

  const name = clerkUser.fullName || 'User';

  try {
    // 1. FAST PATH: Check if we already know this Clerk ID
    // This handles the vast majority of logins for existing users.
    const existingUsers = await query<DbUser>(
      'SELECT id, clerk_id, email, name FROM users WHERE clerk_id = $1 LIMIT 1',
      [clerkUser.id]
    );

    if (existingUsers && existingUsers.length > 0) {
      const u = existingUsers[0];
      return {
        uuid: u.id,
        clerk_id: u.clerk_id,
        email: u.email,
        name: u.name,
        server_version: 0,
      };
    }

    // 2. ATOMIC UPSERT: Handle New User OR Legacy Account Merge
    // If email exists: Update it with the new clerk_id (Merge).
    // If email does not exist: Insert a new row (Create).
    // We use ON CONFLICT to make this race-condition proof.
    const upsertSql = `
      INSERT INTO users (email, clerk_id, name, password_hash, status)
      VALUES ($1, $2, $3, 'clerk_managed', 'active')
      ON CONFLICT (email) 
      DO UPDATE SET 
        clerk_id = EXCLUDED.clerk_id, 
        updated_at = NOW()
      RETURNING id, email, name, clerk_id
    `;

    const result = await query<DbUser>(upsertSql, [email, clerkUser.id, name]);
    const user = result[0];

    return {
      uuid: user.id,
      clerk_id: user.clerk_id,
      email: user.email,
      name: user.name,
      server_version: 0,
    };
  } catch (err: any) {
    // 3. OFFLINE FALLBACK
    // If the database connection fails (network error, timeout),
    // we generate a temporary local session so the user can still use the app.
    console.warn('[Bridge] Database unreachable, falling back to offline session', err);
    return await createOfflineFallback(clerkUser.id, email, name);
  }
};

// Separated helper for cleaner code
const createOfflineFallback = async (
  clerkId: string,
  email: string,
  name: string
): Promise<BridgeUser> => {
  const localId = uuidv4();
  try {
    // Save to local SQLite/AsyncStorage so the app "remembers" them while offline
    await saveSession(localId, name, email);
  } catch (e) {
    console.warn('[Bridge] Failed to save local session fallback', e);
  }

  return {
    uuid: localId,
    clerk_id: clerkId,
    email: email,
    name: name,
    server_version: 0,
  };
};
