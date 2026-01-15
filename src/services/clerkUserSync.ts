import { uuidv4 } from '../utils/uuid';
import { query } from '../api/neonClient';
import { getSession, saveSession } from '../db/session';

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
  isOfflineFallback?: boolean; // true when we couldn't persist to Neon
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
  const rawEmail = clerkUser.emailAddresses[0]?.emailAddress;
  if (!rawEmail) throw new Error('Clerk user must have an email');

  // Normalize email to avoid case/dot mismatches from providers
  const email = String(rawEmail).trim().toLowerCase();
  const name = (clerkUser.fullName || 'User')?.toString().trim() || 'User';

  // Retry transient failures a few times to avoid creating offline fallbacks unnecessarily
  let attempt = 0;
  const maxAttempts = 3;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (attempt < maxAttempts) {
    attempt += 1;
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

      // 2. CREATE USER (Clerk-id authoritative)
      // We do NOT use email as an identity key. The user boundary is clerk_id.
      // However, for legacy accounts that may exist by email-only, we allow
      // attaching clerk_id ONLY when the existing row has clerk_id NULL.
      const upsertSql = `
        INSERT INTO users (clerk_id, email, name, password_hash, status)
        VALUES ($1, $2, $3, 'clerk_managed', 'active')
        ON CONFLICT (email)
        DO UPDATE SET
          clerk_id = EXCLUDED.clerk_id,
          name = COALESCE(users.name, EXCLUDED.name),
          updated_at = NOW()
        WHERE users.clerk_id IS NULL OR users.clerk_id = EXCLUDED.clerk_id
        RETURNING id, clerk_id, email, name
      `;

      const upserted = await query<DbUser>(upsertSql, [clerkUser.id, email, name]);
      if (!upserted || upserted.length === 0) {
        // Conflict existed but could not be claimed (clerk_id owned by another account)
        const legacy = await query<DbUser>(
          'SELECT id, clerk_id, email, name FROM users WHERE lower(email) = $1 LIMIT 1',
          [email]
        );
        const row = legacy && legacy.length ? legacy[0] : null;
        if (row?.clerk_id && String(row.clerk_id) !== String(clerkUser.id)) {
          throw new Error('Email is already linked to another account');
        }
      }

      // Read authoritative record back by clerk_id.
      const finalRows = await query<DbUser>(
        'SELECT id, clerk_id, email, name FROM users WHERE clerk_id = $1 LIMIT 1',
        [clerkUser.id]
      );
      const user = finalRows && finalRows.length ? finalRows[0] : null;
      if (!user) return await createOfflineFallback(clerkUser.id, email, name);

      return {
        uuid: user.id,
        clerk_id: user.clerk_id,
        email: user.email,
        name: user.name,
        server_version: 0,
        isOfflineFallback: false,
      };
    } catch (err: any) {
      // Auth/identity conflicts are not connectivity issues; do not create offline fallbacks.
      if (String(err?.message || '').includes('Email is already linked to another account')) {
        throw err;
      }

      // Determine if error is transient
      const msg = String(err?.message || err || '').toLowerCase();
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('connection') ||
        msg.includes('network') ||
        msg.includes('econnreset') ||
        msg.includes('enotfound') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('fetch');

      if (attempt < maxAttempts && isTransient) {
        const backoff = 500 * attempt;
        console.warn(`[Bridge] transient error, retrying in ${backoff}ms`, err);
        await sleep(backoff);
        continue;
      }

      // Non-transient or exhausted attempts: fallback to offline
      console.warn(
        '[Bridge] Database unreachable or permanent error, falling back to offline session',
        err
      );
      return await createOfflineFallback(clerkUser.id, email, name);
    }
  }
  // If we somehow exit the retry loop without returning, fall back to offline.
  return await createOfflineFallback(clerkUser.id, email, name);
};

// Separated helper for cleaner code
const createOfflineFallback = async (
  clerkId: string,
  email: string,
  name: string
): Promise<BridgeUser> => {
  // CRITICAL:
  // Do not create a new local UUID if we already have a persisted session for
  // this same Clerk user. Creating a new UUID would switch the SQLite namespace
  // and make the app appear to "reset to 0" when offline.
  try {
    const existing = await getSession();
    const existingClerk = (existing as any)?.clerk_id ? String((existing as any).clerk_id) : null;
    const existingId = (existing as any)?.id ? String((existing as any).id) : null;
    if (existingId && existingClerk && existingClerk === String(clerkId)) {
      return {
        uuid: existingId,
        clerk_id: String(clerkId),
        email: (existing as any)?.email ? String((existing as any).email) : email,
        name: (existing as any)?.name ? String((existing as any).name) : name,
        server_version: 0,
        isOfflineFallback: true,
      };
    }
  } catch (e) {
    // ignore and fall back to generating a new local id
  }

  const localId = uuidv4();
  try {
    // Save fallback session locally (session persisted via AsyncStorage wrapper)
    await saveSession(localId, name, email, undefined, undefined, clerkId);
  } catch (e) {
    console.warn('[Bridge] Failed to save local session fallback', e);
  }

  return {
    uuid: localId,
    clerk_id: clerkId,
    email: email,
    name: name,
    server_version: 0,
    isOfflineFallback: true,
  };
};
