import { Platform, UIManager } from 'react-native';

declare global {
  // Fabric-enabled bundles expose this flag on the global object.
  // eslint-disable-next-line no-var
  var nativeFabricUIManager: unknown | undefined;
}

export const enableLegacyLayoutAnimations = () => {
  const isAndroid = Platform.OS === 'android';
  const isFabric = typeof global.nativeFabricUIManager !== 'undefined';
  if (isAndroid && !isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
};
