import 'dotenv/config';

/**
 * Expo dynamic config
 * Safe for:
 * - APK testing
 * - EAS builds
 * - Play Store production
 */
export default ({ config }) => {
  return {
    ...config,
    // App versioning (kept in sync with app.json / package.json)
    version: '2.5.0',

    // 🔗 REQUIRED for Clerk + Google OAuth (NO proxy)
    scheme: 'dhandiary',

    name: 'DhanDiary',
    slug: 'dhandiary',

    android: {
      ...config.android,
      package: 'com.ellowdigital.dhandiary',
      versionCode: 242,
    },

    ios: {
      ...config.ios,
      buildNumber: '242',
    },

    extra: {
      ...config.extra,

      /**
       * ✅ PUBLIC CLIENT VARIABLES
       * Must be prefixed with EXPO_PUBLIC_
       */
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null,

      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? null,

      /**
       * 🔒 NEON DB PROTECTION
       * DB URL is injected ONLY when explicitly enabled
       */
      EXPO_ENABLE_NEON_CLIENT: process.env.EXPO_ENABLE_NEON_CLIENT ?? '0',

      NEON_URL: process.env.EXPO_ENABLE_NEON_CLIENT === '1' ? (process.env.NEON_URL ?? null) : null,
    },
  };
};
