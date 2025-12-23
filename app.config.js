const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

// Load .env if present
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

module.exports = ({ config } = {}) => {
  // Prefer Expo-provided config; fallback to app.json if needed
  let baseConfig = config;
  if (!baseConfig) {
    try {
      const appJson = require(path.resolve(process.cwd(), "app.json"));
      baseConfig = appJson?.expo ?? appJson ?? {};
    } catch {
      baseConfig = {};
    }
  }

  return {
    ...baseConfig,

    // 🔗 REQUIRED for Clerk + Google OAuth deep linking
    scheme: "dhandiary",

    name: baseConfig.name ?? "DhanDiary",
    slug: baseConfig.slug ?? "dhandiary",

    android: {
      ...(baseConfig.android ?? {}),
      package:
        baseConfig.android?.package ??
        "com.ellowdigital.dhandiary",
    },

    extra: {
      ...(baseConfig.extra ?? {}),

      // ✅ Public env vars (safe in client)
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
        baseConfig.extra?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ??
        null,

      EXPO_PUBLIC_API_URL:
        process.env.EXPO_PUBLIC_API_URL ??
        baseConfig.extra?.EXPO_PUBLIC_API_URL ??
        null,

      // 🔒 Neon DB safety guard (DO NOT expose by default)
      EXPO_ENABLE_NEON_CLIENT:
        process.env.EXPO_ENABLE_NEON_CLIENT ??
        baseConfig.extra?.EXPO_ENABLE_NEON_CLIENT ??
        "0",

      NEON_URL:
        process.env.EXPO_ENABLE_NEON_CLIENT === "1"
          ? process.env.NEON_URL ?? null
          : null,
    },
  };
};
