import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// Ensure a safe `global.require` accessor exists early to avoid runtime errors
// in environments where some modules attempt `global.require` before the
// JS runtime fully populates the global require helper. This creates a
// non-enumerable accessor that returns the real `require` when available.
declare const global: any;
try {
	if (typeof global !== 'undefined' && typeof (global as any).require === 'undefined') {
		Object.defineProperty(global, 'require', {
			configurable: true,
			enumerable: false,
			get() {
				// prefer the local require function if available
				return typeof require === 'function' ? require : undefined;
			},
		});
	}
} catch (e) {
	// ignore — defensive guard
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
