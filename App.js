// Compatibility bootstrap for Expo Go and Metro entry variants.
// Some runtimes (Expo Go) don't use `package.json`/`app.json` entry overrides,
// so ensure `global.require` exists before any other module evaluates.
(function () {
  try {
    if (typeof global !== 'undefined') {
      if (typeof global.require === 'undefined') {
        try {
          global.require = typeof require === 'function' ? require : undefined;
        } catch (e) {
          try {
            Object.defineProperty(global, 'require', {
              configurable: true,
              enumerable: false,
              value: typeof require === 'function' ? require : undefined,
              writable: true,
            });
          } catch (err) {
            // ignore
          }
        }
      }
    }
    if (typeof globalThis !== 'undefined' && typeof globalThis.require === 'undefined') {
      try {
        globalThis.require =
          (global && global.require) || (typeof require === 'function' ? require : undefined);
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // defensive noop
  }

  // Now delegate to the actual app entry (TSX). Metro will resolve the file.
  const app = require('./App');
  // If module exports default, re-export it as default for compatibility
  if (app && app.default) module.exports = app.default;
  else module.exports = app;
})();
