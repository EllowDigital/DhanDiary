// Ensures critical React Native globals exist before jest-expo's preset runs.
(function bootstrapNativeModules(globalObject) {
  if (typeof globalObject !== 'object' || !globalObject) {
    return;
  }

  const existingProxy = globalObject.nativeModuleProxy || {};
  const ensuredProxy = {
    ...existingProxy,
    UIManager: existingProxy.UIManager || {},
    NativeUnimoduleProxy: {
      ...(existingProxy.NativeUnimoduleProxy || {}),
      viewManagersMetadata:
        (existingProxy.NativeUnimoduleProxy &&
          existingProxy.NativeUnimoduleProxy.viewManagersMetadata) ||
        {},
    },
  };

  globalObject.nativeModuleProxy = ensuredProxy;

  if (!globalObject.__fbBatchedBridgeConfig) {
    globalObject.__fbBatchedBridgeConfig = {
      remoteModuleConfig: [],
      localModulesConfig: [],
      moduleIDs: [],
      modules: [],
    };
  }

  if (typeof globalObject.window !== 'object') {
    globalObject.window = globalObject;
  }

  try {
    const nativeModules = require('react-native/Libraries/BatchedBridge/NativeModules');
    if (nativeModules && typeof nativeModules === 'object') {
      if (!nativeModules.UIManager) {
        nativeModules.UIManager = {};
      }
      if (!nativeModules.NativeUnimoduleProxy) {
        nativeModules.NativeUnimoduleProxy = { viewManagersMetadata: {} };
      } else if (!nativeModules.NativeUnimoduleProxy.viewManagersMetadata) {
        nativeModules.NativeUnimoduleProxy.viewManagersMetadata = {};
      }
    }
  } catch (error) {
    // ignore; jest-expo will provide fallbacks if this import fails
  }
})(typeof globalThis === 'object' ? globalThis : {});
