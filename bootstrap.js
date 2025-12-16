/* eslint no-useless-catch: "off" */
// Small bootstrap file that ensures `global.require` exists BEFORE any modules
// are loaded. Some third-party modules access `global.require` during their
// top-level initialization in certain runtimes; setting it early avoids a
// runtime ReferenceError.
(function () {
  if (typeof global !== 'undefined') {
    if (typeof global.require === 'undefined') {
      // Try a direct assignment first; if that fails, fall back to defineProperty.
      if (typeof require === 'function') {
        try {
          global.require = require;
        } catch (e) {
          try {
            Object.defineProperty(global, 'require', {
              configurable: true,
              enumerable: false,
              value: require,
              writable: true,
            });
          } catch (err) {
            // best-effort: ignore
          }
        }
      } else {
        // no-op when `require` isn't available in this runtime
      }
    }
  }

  // Now load the actual TypeScript entry which registers the root component.
  // Use require so this bootstrap runs before module evaluation of the app.
  try {
    require('./index.ts');
  } catch (e) {
    // If Metro resolves extensionless, try index.js
    try {
      require('./index');
    } catch (err) {
      // Allow Metro to surface the real error
      throw err;
    }
  }
})();
