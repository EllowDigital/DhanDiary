const fs = require('fs');
const path = require('path');

// Create safe prefab README stubs for packages known to cause prefab/unreadable-package failures
const cwd = process.cwd();
const candidates = [
  'node_modules/react-native-worklets/android/build/intermediates/prefab_package/release/prefab/README.txt',
  'node_modules/react-native-worklets-core/android/build/intermediates/prefab_package/release/prefab/README.txt',
];

candidates.forEach((rel) => {
  try {
    const full = path.join(cwd, rel);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(full)) {
      fs.writeFileSync(
        full,
        'Prefab stub created by postinstall-fixes.js to ensure build tooling can read the prefab package.'
      );
      console.log('[postinstall-fixes] Created:', rel);
    }
  } catch (e) {
    // Non-fatal
    console.warn('[postinstall-fixes] failed to create', rel, e && e.message);
  }
});

// No-op exit code so npm install succeeds
process.exit(0);
