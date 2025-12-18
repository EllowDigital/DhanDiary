// File replaced with a safe re-export to local auth shim.
// The project uses local auth in `src/services/auth.ts`; keep this path
// present so older imports that referenced `services/firebaseAuth` continue
// to work.

export * from './auth';

import * as authMod from './auth';

export async function startGithubSignIn(intent: 'signIn' | 'link' = 'signIn') {
  if (typeof (authMod as any).startGithubSignIn === 'function') {
    return (authMod as any).startGithubSignIn(intent);
  }
  throw new Error('GitHub sign-in is not available in local-only build.');
}
