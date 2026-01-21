/**
 * Expo dynamic config
 * Safe for:
 * - Local APK builds (Gradle)
 * - EAS builds
 * - Play Store production
 * - ensure my expo.dev also support 100% of these env vars
 */
export default ({ config }) => {
  return {
    ...config,

    // App versioning
    version: '2.5.2',

    // Required for Clerk + OAuth (no proxy)
    scheme: 'dhandiary',

    name: 'DhanDiary',
    slug: 'dhandiary',

    android: {
      ...config.android,
      package: 'com.ellowdigital.dhandiary',
      versionCode: 252,
    },

    ios: {
      ...config.ios,
      buildNumber: '252',
    },

    extra: {
      ...config.extra,

      /**
       * ✅ PUBLIC CLIENT VARIABLES
       * Must be prefixed with EXPO_PUBLIC_
       */
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null,

      /**
       * 🔒 NEON DB PROTECTION
       * DB URL injected ONLY when enabled
       */
      EXPO_ENABLE_NEON_CLIENT: process.env.EXPO_ENABLE_NEON_CLIENT ?? '0',

      NEON_URL: process.env.EXPO_ENABLE_NEON_CLIENT === '1' ? (process.env.NEON_URL ?? null) : null,
    },
  };
};
