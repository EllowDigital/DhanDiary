import { neon } from '@neondatabase/serverless';
import Constants from 'expo-constants';
import { query } from '../api/neonClient'; // Use our robust wrapper
import { v4 as uuidv4 } from 'uuid';
import { saveSession } from '../db/localDb';

/*
  The Bridge Service:
  Connects Clerk Identities (string ids) to our Internal Postgres UUIDs.
  Handles merging legacy email users with new Clerk logins.
*/

export interface BridgeUser {
  uuid: string; // The internal DB ID used for Foreign Keys
  clerk_id: string;
  email: string;
  name: string | null;
  server_version: number;
}

export const syncClerkUserToNeon = async (clerkUser: {
  id: string;
  emailAddresses: { emailAddress: string }[];
  fullName?: string | null;
}): Promise<BridgeUser> => {
  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) throw new Error('Clerk user must have an email');

  try {
    // 1. Check by clerk_id
    const byClerkId = await query('SELECT * FROM users WHERE clerk_id = $1 LIMIT 1', [
      clerkUser.id,
    ]);
    if (byClerkId && byClerkId.length > 0) {
      const u = byClerkId[0];
      return {
        uuid: u.id,
        clerk_id: u.clerk_id,
        email: u.email,
        name: u.name,
        server_version: 0,
      };
    }

    // 2. Check by email (legacy account merge)
    const byEmail = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
    if (byEmail && byEmail.length > 0) {
      const u = byEmail[0];
      try {
        await query('UPDATE users SET clerk_id = $1, updated_at = NOW() WHERE id = $2', [
          clerkUser.id,
          u.id,
        ]);
      } catch (e) {
        // ignore update errors
      }
      return {
        uuid: u.id,
        clerk_id: clerkUser.id,
        email: u.email,
        name: u.name,
        server_version: 0,
      };
    }

    // 3. Create new user; handle duplicate-key race by recovering if insert fails
    try {
      const newUser = await query(
        `INSERT INTO users (email, clerk_id, name, password_hash, status)
                 VALUES ($1, $2, $3, 'clerk_managed', 'active')
                 RETURNING id, email, name, clerk_id`,
        [email, clerkUser.id, clerkUser.fullName || 'User']
      );
      const created = newUser[0];
      return {
        uuid: created.id,
        clerk_id: created.clerk_id,
        email: created.email,
        name: created.name,
        server_version: 0,
      };
    } catch (insertErr: any) {
      console.warn(
        '[Bridge] Insert failed, attempting to recover by querying email',
        insertErr?.message || insertErr
      );
      try {
        const byEmailAgain = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
        if (byEmailAgain && byEmailAgain.length > 0) {
          const u = byEmailAgain[0];
          try {
            if (!u.clerk_id) {
              await query('UPDATE users SET clerk_id = $1, updated_at = NOW() WHERE id = $2', [
                clerkUser.id,
                u.id,
              ]);
              u.clerk_id = clerkUser.id;
            }
          } catch (e) {
            // ignore
          }
          return {
            uuid: u.id,
            clerk_id: u.clerk_id,
            email: u.email,
            name: u.name,
            server_version: 0,
          };
        }
      } catch (e) {
        // fall through
      }
      // If recovery failed, rethrow to be handled by outer catch
      throw insertErr;
    }
  } catch (err: any) {
    console.warn('[Bridge] Neon query failed, attempting recovery by email', err?.message || err);
    try {
      const existing = await query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email]);
      if (existing && existing.length > 0) {
        const u = existing[0];
        return {
          uuid: u.id,
          clerk_id: u.clerk_id,
          email: u.email,
          name: u.name,
          server_version: 0,
        };
      }
    } catch (e) {
      // ignore
    }

    const localId = uuidv4();
    try {
      await saveSession(localId, clerkUser.fullName || 'User', email);
    } catch (e) {
      console.warn('[Bridge] Failed to save local session fallback', e);
    }
    return {
      uuid: localId,
      clerk_id: clerkUser.id,
      email,
      name: clerkUser.fullName || null,
      server_version: 0,
    };
  }
};
