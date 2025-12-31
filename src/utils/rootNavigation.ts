import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function isReady() {
  try {
    return navigationRef.isReady();
  } catch (e) {
    return false;
  }
}

export function navigate(name: keyof RootStackParamList, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as any, params);
  } else {
    console.warn('[RootNav] navigate called before ready', name);
  }
}

export function resetRoot(state: { index: number; routes: any[] }) {
  if (navigationRef.isReady() && typeof navigationRef.resetRoot === 'function') {
    try {
      (navigationRef as any).resetRoot(state);
    } catch (e) {
      // Fallback to CommonActions.reset
      navigationRef.dispatch(CommonActions.reset(state as any));
    }
  } else if (navigationRef.isReady()) {
    navigationRef.dispatch(CommonActions.reset(state as any));
  } else {
    console.warn('[RootNav] resetRoot called before navigation is ready');
  }
}

export default navigationRef;
