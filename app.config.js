const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load .env if present
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Export function using the modern signature used by Expo
module.exports = ({ config } = {}) => {
  // Prefer provided config; fall back to app.json if missing
  let baseConfig = config;
  if (!baseConfig) {
    try {
      const appJson = require(path.resolve(process.cwd(), 'app.json'));
      baseConfig = appJson?.expo ?? appJson ?? {};
    } catch (e) {
      baseConfig = {};
    }
  }

  return {
    ...baseConfig,
    extra: {
      ...(baseConfig.extra ?? {}),

      // PUBLIC environment variables (safe to access from the app)
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? baseConfig.extra?.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null,

      EXPO_PUBLIC_API_URL:
        process.env.EXPO_PUBLIC_API_URL ?? baseConfig.extra?.EXPO_PUBLIC_API_URL ?? null,

      // NOTE: Intentionally do NOT expose NEON_URL here. Neon DB connection
      // strings are secrets and must only be used on backend servers or build scripts.
    },
  };
};
