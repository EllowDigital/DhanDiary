// Polyfill TextEncoder/TextDecoder for NeonDB (SCRAM-SASL auth)
// Polyfill TextEncoder/TextDecoder for NeonDB (SCRAM-SASL auth)
const TextEncodingPolyfill = require('text-encoding');
Object.assign(global, {
    TextEncoder: TextEncodingPolyfill.TextEncoder,
    TextDecoder: TextEncodingPolyfill.TextDecoder,
});

// Polyfill crypto.getRandomValues
import 'react-native-get-random-values';
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
