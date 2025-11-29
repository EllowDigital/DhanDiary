// Development-only diagnostics helpers
// When React warns about missing keys in lists, this helper captures
// the console error and prints a full JS stack so you can locate the source.

import { LogBox } from 'react-native';

if (__DEV__) {
  // Hide known noisy Neon errors from the redbox/LogBox UI but keep them in console
  try {
    LogBox.ignoreLogs([
      'Neon Query Error (permanent):',
      'Neon Query failed after retries:',
      // keep duplicate-key warnings visible as warnings only
    ]);
  } catch (e) {
    // ignore if LogBox isn't available in this environment
  }

  const original = console.error;
  console.error = (...args: any[]) => {
    try {
      const msg = args && args[0] ? String(args[0]) : '';
      if (msg && msg.includes("unique 'key' prop")) {
        // Print a clearer stacktrace to help locate offending component
        original('--- devDiagnostics: React missing-key warning captured ---');
        original('Message:', ...args);
        original('JS stack trace:');
        // create and log a stack to help find the callsite in user code
        const err = new Error('devDiagnostics stack');
        // remove first two frames (this file + console wrapper)
        const stack = (err.stack || '').split('\n').slice(2).join('\n');
        original(stack);
        original('--- end devDiagnostics ---');
      }
    } catch (e) {
      // fallback to original if anything goes wrong
      original('devDiagnostics error', e);
    }

    // still call original so message appears in console output
    original.apply(console, args as any);
  };
}

export {};
