import Constants from 'expo-constants';

// Lightweight GitHub OAuth helper for dev/testing. NOTE: a secure server-side
// token exchange is recommended for production. This helper will attempt a
// client-side code->token exchange if you provide `EXPO_GITHUB_CLIENT_SECRET`
// in your environment (acceptable for quick local testing only).

const getGithubClientId = (): string | null => {
  try {
    const extra = (Constants?.expoConfig?.extra || {}) as any;
    return (
      process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ||
      extra?.oauth?.githubClientId ||
      null
    );
  } catch (e) {
    return null;
  }
};

const getGithubClientSecret = (): string | null => {
  try {
    const extra = (Constants?.expoConfig?.extra || {}) as any;
    return process.env.EXPO_GITHUB_CLIENT_SECRET || extra?.oauth?.githubClientSecret || null;
  } catch (e) {
    return null;
  }
};

export async function signInWithGithub() {
  // Try to use Expo AuthSession if available
  try {
    const clientId = getGithubClientId();
    if (!clientId) throw new Error('GitHub client id not configured (EXPO_PUBLIC_GITHUB_CLIENT_ID)');

    // Lazy require to avoid adding a hard dependency for non-Expo builds
    const AuthSession = require('expo-auth-session');
    const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
      clientId
    )}&scope=read:user%20user:email&redirect_uri=${encodeURIComponent(redirectUri)}`;

    const result = await AuthSession.startAsync({ authUrl });
    if (!result || result.type !== 'success') {
      throw new Error('GitHub sign-in cancelled or failed');
    }

    const code = (result.params && (result.params.code || result.params.code)) || null;
    if (!code) throw new Error('No code returned from GitHub');

    // Exchange code for token. Prefer server-side exchange; fallback to client-side
    // if EXPO_GITHUB_CLIENT_SECRET is provided (dev only).
    const clientSecret = getGithubClientSecret();
    if (!clientSecret) {
      throw new Error(
        'No client secret configured; provide EXPO_GITHUB_CLIENT_SECRET for client-side exchange, or implement server-side exchange.'
      );
    }

    // Exchange code -> access_token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    });
    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson && tokenJson.access_token;
    if (!accessToken) throw new Error('Failed to obtain GitHub access token: ' + JSON.stringify(tokenJson));

    // Try to sign into Firebase with the GitHub token
    try {
      const firebaseAuth: any = require('@react-native-firebase/auth');
      if (firebaseAuth) {
        const authInstance = firebaseAuth.default ? firebaseAuth.default() : firebaseAuth();
        const GitHubProvider =
          firebaseAuth.GithubAuthProvider || firebaseAuth.default?.GithubAuthProvider || authInstance.GithubAuthProvider;
        if (GitHubProvider && typeof GitHubProvider.credential === 'function') {
          const cred = GitHubProvider.credential(accessToken);
          if (cred && typeof authInstance.signInWithCredential === 'function') {
            const res = await authInstance.signInWithCredential(cred);
            return { firebaseResult: res, credential: cred, raw: { accessToken } };
          }
        }
      }
    } catch (e) {
      // ignore and try JS SDK
    }

    try {
      const firebaseJs = require('firebase/auth');
      if (firebaseJs && firebaseJs.getAuth && firebaseJs.signInWithCredential && firebaseJs.GithubAuthProvider) {
        const { getAuth, GithubAuthProvider, signInWithCredential } = firebaseJs;
        const cred = GithubAuthProvider.credential(accessToken);
        const res = await signInWithCredential(getAuth(), cred);
        return { firebaseResult: res, credential: cred, raw: { accessToken } };
      }
    } catch (e) {
      // fall through
    }

    // If Firebase not available, return raw token so callers can handle it.
    return { success: true, raw: { accessToken } };
  } catch (err: any) {
    const msg = err?.message || String(err);
    const wrapped = new Error(`GitHub sign-in failed: ${msg}`);
    (wrapped as any).original = err;
    throw wrapped;
  }
}

export default { signInWithGithub };

export const isGithubConfigured = (): boolean => {
  try {
    return !!getGithubClientId();
  } catch (e) {
    return false;
  }
};
