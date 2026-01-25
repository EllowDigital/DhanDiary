import AsyncStorage from '../utils/AsyncStorageWrapper';
import { notifySessionChanged } from '../utils/sessionEvents';
import { isUuid, uuidv4 } from '../utils/uuid';

export type Session = {
  id: string; // internal UUID used by app for Neon queries
  name: string;
  email: string;
  clerk_id?: string | null; // original Clerk id when available
  image?: string | null;
  imageUrl?: string | null;
} | null;

const KEY = 'FALLBACK_SESSION';
const NO_GUEST_KEY = 'NO_GUEST_MODE';
const ACCOUNT_DELETED_KEY = 'ACCOUNT_DELETED_AT';

export const getSession = async (): Promise<Session> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch (e) {
    return null;
  }
};

/**
 * Persist a session. If `id` is not a valid UUID (e.g., Clerk id or temporary
 * token), we generate an internal UUID and store the original value under
 * `clerk_id` so Neon queries always receive a valid UUID.
 */
export const saveSession = async (
  id: string,
  name: string,
  email: string,
  image?: string | null,
  imageUrl?: string | null,
  clerkId?: string | null
) => {
  try {
    // Read existing session if present so we can preserve image fields when callers
    // don't supply them (many callers only pass id/name/email).
    let existing: any = null;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) existing = JSON.parse(raw);
    } catch (e) {}

    let payload: any = { name: name || '', email: email || '' };
    if (isUuid(id)) {
      payload.id = id;
      // Prefer explicitly provided clerkId; otherwise preserve existing stored clerk_id.
      const nextClerk = typeof clerkId !== 'undefined' ? clerkId : existing?.clerk_id;
      if (nextClerk) payload.clerk_id = nextClerk;
    } else {
      // Backward compatibility:
      // - Older call sites pass a provider id (e.g., Clerk user id) as `id`.
      // - We generate an internal UUID for local SQLite + future Neon mapping.
      payload.id = uuidv4();
      payload.clerk_id = typeof clerkId !== 'undefined' ? clerkId : id;
    }

    // Determine resulting image fields:
    // - If caller provided `image`/`imageUrl` (including explicit null), use it.
    // - If caller omitted the parameter (undefined), preserve existing stored value when available.
    const finalImage = typeof image === 'undefined' ? (existing?.image ?? null) : image;
    const finalImageUrl = typeof imageUrl === 'undefined' ? (existing?.imageUrl ?? null) : imageUrl;

    if (finalImage) payload.image = finalImage;
    if (finalImageUrl) payload.imageUrl = finalImageUrl;

    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
    try {
      notifySessionChanged();
    } catch (e) {}
  } catch (e) {
    console.error('[Session] Failed to save session', e);
  }
};

export const clearSession = async () => {
  try {
    await AsyncStorage.removeItem(KEY);
    try {
      notifySessionChanged();
    } catch (e) {}
  } catch (e) {
    console.warn('[Session] Failed to clear session', e);
  }
};

export const setNoGuestMode = async (noGuest: boolean) => {
  try {
    if (noGuest) {
      await AsyncStorage.setItem(NO_GUEST_KEY, '1');
    } else {
      await AsyncStorage.removeItem(NO_GUEST_KEY);
    }
  } catch (e) {
    console.warn('[Session] Failed to set no-guest mode', e);
  }
};

export const getNoGuestMode = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(NO_GUEST_KEY);
    return v === '1';
  } catch (e) {
    return false;
  }
};

export const setAccountDeletedAt = async (isoTs: string | null) => {
  try {
    if (isoTs) await AsyncStorage.setItem(ACCOUNT_DELETED_KEY, isoTs);
    else await AsyncStorage.removeItem(ACCOUNT_DELETED_KEY);
    try {
      notifySessionChanged();
    } catch (e) {}
  } catch (e) {
    console.warn('[Session] Failed to set account deleted flag', e);
  }
};

export const getAccountDeletedAt = async (): Promise<string | null> => {
  try {
    const v = await AsyncStorage.getItem(ACCOUNT_DELETED_KEY);
    return v || null;
  } catch (e) {
    return null;
  }
};

/**
 * Validate that the current session is still valid.
 * Returns true only if a valid UUID session exists.
 */
export const isValidSessionStored = async (): Promise<boolean> => {
  try {
    const session = await getSession();
    if (!session?.id) return false;
    // Basic UUID validation (36 chars with dashes)
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id);
  } catch (e) {
    return false;
  }
};

/**
 * Ensure session is persisted with all required fields.
 * Useful after login to verify everything was saved correctly.
 */
export const ensureSessionPersisted = async (): Promise<Session> => {
  try {
    const session = await getSession();
    if (!session?.id) {
      console.warn('[Session] No session found during persistence check');
      return null;
    }

    // Re-save to ensure all fields are properly stored
    await saveSession(
      session.id,
      session.name || '',
      session.email || '',
      session.image ?? null,
      session.imageUrl ?? null,
      session.clerk_id ?? null
    );

    // Re-read and verify
    const verified = await getSession();
    if (__DEV__ && !verified?.id) {
      console.warn('[Session] Persistence verification failed');
    }
    return verified;
  } catch (e) {
    console.error('[Session] Persistence check failed', e);
    return null;
  }
};

export default {
  getSession,
  saveSession,
  clearSession,
  setNoGuestMode,
  getNoGuestMode,
  setAccountDeletedAt,
  getAccountDeletedAt,
  isValidSessionStored,
  ensureSessionPersisted,
};
