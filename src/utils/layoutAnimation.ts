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
  // Attempt to enable legacy LayoutAnimation on Android only when not using Fabric.
  // New architecture / Fabric exposes a no-op for the setter; avoid calling it
  // when Fabric is active to prevent native warnings. We also guard the call
  // with existence checks so this function is safe to call from app startup.
  try {
    if (isAndroid && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
      layoutAnimationsEnabled = true;
    }
  } catch (e) {
    // Ignore; native may not support this setter in some environments.
  }
};
