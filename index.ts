import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// Ensure a safe `global.require` accessor exists early to avoid runtime errors
// in environments where some modules attempt `global.require` before the
// JS runtime fully populates the global require helper. This creates a
// non-enumerable accessor that returns the real `require` when available.
declare const global: any;
try {
  if (typeof global !== 'undefined' && typeof (global as any).require === 'undefined') {
    try {
      // Prefer direct assignment when possible — some runtimes may not invoke getters
      (global as any).require = typeof require === 'function' ? require : undefined;
    } catch (e) {
      // Fallback to defineProperty if assignment is restricted
      Object.defineProperty(global, 'require', {
        configurable: true,
        enumerable: false,
        value: typeof require === 'function' ? require : undefined,
        writable: true,
      });
    }
  }
} catch (e) {
  // ignore — defensive guard
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
