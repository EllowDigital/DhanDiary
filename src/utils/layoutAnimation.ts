import { Platform, UIManager } from 'react-native';

declare global {
  // Fabric-enabled bundles expose this flag on the global object.
  var nativeFabricUIManager: unknown | undefined;
}

let layoutAnimationsEnabled = false;

export const enableLegacyLayoutAnimations = () => {
  if (layoutAnimationsEnabled) return;
  const isAndroid = Platform.OS === 'android';
  const isFabric = typeof globalThis.nativeFabricUIManager !== 'undefined';
  if (isAndroid && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
    layoutAnimationsEnabled = true;
  }
};
