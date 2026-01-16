/**
 * Expo dynamic config
 * Safe for:
 * - Local APK builds (Gradle)
 * - EAS builds
 * - Play Store production
 */
export default ({ config }) => {
  return {
    ...config,

    // App versioning
    version: '2.5.0',

    // Required for Clerk + OAuth (no proxy)
    scheme: 'dhandiary',

    name: 'DhanDiary',
    slug: 'dhandiary',

    android: {
      ...config.android,
      package: 'com.ellowdigital.dhandiary',
      versionCode: 250,
    },

    ios: {
      ...config.ios,
      buildNumber: '250',
    },

    extra: {
      ...config.extra,

      /**
       * ✅ PUBLIC CLIENT VARIABLES
       * Must be prefixed with EXPO_PUBLIC_
       */
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null,

      EXPO_PUBLIC_API_URL:
        process.env.EXPO_PUBLIC_API_URL ?? null,

      /**
       * 🔒 NEON DB PROTECTION
       * DB URL injected ONLY when enabled
       */
      EXPO_ENABLE_NEON_CLIENT:
        process.env.EXPO_ENABLE_NEON_CLIENT ?? '0',

      NEON_URL:
        process.env.EXPO_ENABLE_NEON_CLIENT === '1'
          ? process.env.NEON_URL ?? null
          : null,

      /**
       * Clerk account deletion
       * (Do NOT ship admin secrets in production apps)
       */
      CLERK_DELETE_URL:
        process.env.CLERK_DELETE_URL ?? null,

      CLERK_DELETE_API_KEY:
        process.env.CLERK_DELETE_API_KEY ??
        process.env.DELETE_API_KEY ??
        null,
    },
  };
};
