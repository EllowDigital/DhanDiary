/* eslint-disable no-undef */
import 'react-native-get-random-values';

// Polyfill TextEncoder/TextDecoder for NeonDB (SCRAM-SASL auth)
// We use require to ensure it executes immediately when this module is imported
const TextEncodingPolyfill = require('text-encoding');
Object.assign(global, {
    TextEncoder: TextEncodingPolyfill.TextEncoder,
    TextDecoder: TextEncodingPolyfill.TextDecoder,
});

// Polyfill Buffer if needed (standard in Expo but good to be safe for some libs)
if (typeof Buffer === 'undefined') {
    global.Buffer = require('buffer').Buffer;
}

console.log('Polyfills loaded: TextEncoder is ' + (typeof global.TextEncoder));
