const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load .env if present
if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
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

  return {
    ...baseConfig,
    extra: {
      ...(baseConfig.extra || {}),
      NEON_URL: process.env.NEON_URL || (baseConfig.extra && baseConfig.extra.NEON_URL) || null,
    },
  };
};
