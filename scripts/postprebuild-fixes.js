const fs = require('fs');
const path = require('path');

// Guard add_subdirectory() calls in Android-autolinking.cmake to avoid CMake failures
const rel = 'android/app/build/generated/autolinking/src/main/jni/Android-autolinking.cmake';
const full = path.join(process.cwd(), rel);

try {
  if (!fs.existsSync(full)) {
    console.log('[postprebuild-fixes] no autolinking file found at', rel);
    process.exit(0);
  }

  let content = fs.readFileSync(full, 'utf8');
  // If file already contains if(EXISTS, assume patched
  if (content.includes('if(EXISTS')) {
    console.log('[postprebuild-fixes] autolinking file already patched');
    process.exit(0);
  }

  const lines = content.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*add_subdirectory\((.+)\)\s*$/);
    if (m) {
      const dir = m[1].trim();
      out.push(`if(EXISTS ${dir})`);
      out.push(line);
      out.push('endif()');
    } else {
      out.push(line);
    }
  }

  fs.writeFileSync(full, out.join('\n'));
  console.log('[postprebuild-fixes] patched autolinking file:', rel);
} catch (e) {
  console.warn('[postprebuild-fixes] failed to patch autolinking file', e && e.message);
}

process.exit(0);
