// File replaced with a safe re-export to local auth shim.
// The project uses local auth in `src/services/auth.ts`; keep this path
// present so older imports that referenced `services/firebaseAuth` continue
// to work.

export * from './auth';
