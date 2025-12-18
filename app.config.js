const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load .env if present (suppress dotenv logs)
if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
  try {
    dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  } catch (e) {
    // Some dotenv variants may not accept `quiet`; fall back to standard config
    try {
      dotenv.config({ path: path.resolve(process.cwd(), '.env') });
    } catch (ee) {}
  }
}

// Defensive app config: sometimes the `config` argument may be undefined
// when `expo config` is invoked in certain environments. In that case,
// fall back to reading `app.json` so EAS/expo can still compute the config.
module.exports = (ctx) => {
  let baseConfig = null;
  try {
    if (ctx && ctx.config) baseConfig = ctx.config;
  } catch (e) {
    // ignore
  }

  if (!baseConfig) {
    try {
      // load app.json from project root
      // app.json structure is { expo: { ... } }
      // prefer the expo object as base

      const appJson = require(path.resolve(process.cwd(), 'app.json'));
      baseConfig = appJson && appJson.expo ? appJson.expo : appJson;
    } catch (e) {
      // fallback to empty object; expo will report errors if required fields missing
      baseConfig = {};
    }
  }

  // Firebase removed for local-only mode; do not expose Firebase keys in app config.
  const firebaseExtra = null;

  const oauthExtra = {
    googleClientId:
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      (baseConfig.extra && baseConfig.extra.oauth && baseConfig.extra.oauth.googleClientId) ||
      null,
    githubClientId:
      process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ||
      (baseConfig.extra && baseConfig.extra.oauth && baseConfig.extra.oauth.githubClientId) ||
      null,
  };

  return {
    ...baseConfig,
    extra: {
      ...(baseConfig.extra || {}),
      oauth: oauthExtra,
    },
    // Keep existing plugins but do not implicitly add Google Sign-In plugin.
    plugins: [...(baseConfig.plugins || [])],
  };
};
