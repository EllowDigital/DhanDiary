import { Platform, UIManager } from 'react-native';

declare global {
  // Fabric-enabled bundles expose this flag on the global object.
  var nativeFabricUIManager: unknown | undefined;
}

let layoutAnimationsEnabled = false;

export const enableLegacyLayoutAnimations = () => {
  if (layoutAnimationsEnabled) return;
  const isAndroid = Platform.OS === 'android';
  // New Architecture / Bridgeless / Fabric detection is not fully consistent across
  // RN/Expo versions, so check multiple known flags.
  const g: any = globalThis as any;
  const isNewArch =
    !!g?.RN$Bridgeless ||
    typeof g?.nativeFabricUIManager !== 'undefined' ||
    // TurboModules proxy is commonly present in New Architecture builds.
    typeof g?.__turboModuleProxy !== 'undefined';
  const isFabric = typeof g?.nativeFabricUIManager !== 'undefined';
  // Attempt to enable legacy LayoutAnimation on Android only when not using Fabric.
  // New architecture / Fabric exposes a no-op for the setter; avoid calling it
  // when Fabric is active to prevent native warnings. We also guard the call
  // with existence checks so this function is safe to call from app startup.
  try {
    if (isAndroid && !isNewArch && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
      layoutAnimationsEnabled = true;
    }
  } catch (e) {
    // Ignore; native may not support this setter in some environments.
  }
};
