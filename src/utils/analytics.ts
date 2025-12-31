import Constants from 'expo-constants';

type Payload = Record<string, any> | null;

const ENDPOINT =
  (Constants.expoConfig && (Constants.expoConfig.extra as any)?.ANALYTICS_ENDPOINT) ||
  process.env.ANALYTICS_ENDPOINT ||
  null;

const WRITE_KEY =
  (Constants.expoConfig && (Constants.expoConfig.extra as any)?.ANALYTICS_WRITE_KEY) ||
  process.env.ANALYTICS_WRITE_KEY ||
  null;

const DEFAULT_TIMEOUT = 5000;

const safeJson = (obj: any) => {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    try {
      return JSON.stringify({ ...obj, _safe: true });
    } catch (e2) {
      return 'null';
    }
  }
};

async function postEvent(event: string, payload: Payload) {
  if (!ENDPOINT) return;

  const body = {
    event,
    payload: payload || {},
    timestamp: new Date().toISOString(),
    env: {
      app: (Constants.expoConfig && Constants.expoConfig.name) || 'app',
      version: (Constants.expoConfig && Constants.expoConfig.version) || undefined,
    },
  } as any;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const signal = controller ? controller.signal : undefined;

  const timer = controller ? setTimeout(() => controller.abort(), DEFAULT_TIMEOUT) : null;

  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(WRITE_KEY ? { Authorization: `Bearer ${WRITE_KEY}` } : {}),
      },
      body: safeJson(body),
      signal,
    });
  } catch (e) {
    // Best-effort: don't throw from analytics
    try {
      console.warn('[Analytics] event delivery failed', event, e?.message || e);
    } catch (ee) {}
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function trackEvent(event: string, payload: Payload = null) {
  try {
    // Local console log for debugging and fallback
    try {
      console.info('[Analytics] track', event, payload || {});
    } catch (e) {}

    // Fire-and-forget network send
    void postEvent(event, payload);
  } catch (e) {
    // swallow
  }
}

export async function identify(userId: string | null, traits: Payload = null) {
  try {
    try {
      console.info('[Analytics] identify', userId, traits || {});
    } catch (e) {}

    void postEvent('identify', { userId, traits });
  } catch (e) {}
}

export default { trackEvent, identify };
