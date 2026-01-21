import { Alert, AppState, InteractionManager, Platform } from 'react-native';

type NativeConfirmOptions = {
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

/**
 * Tries to show a native confirmation dialog.
 * Returns false when the app/activity isn't in a safe state to show native UI (common on Android)
 * so callers can fall back to an in-app confirmation.
 */
export async function tryShowNativeConfirm(opts: NativeConfirmOptions): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await new Promise<void>((resolve) =>
        InteractionManager.runAfterInteractions(() => resolve())
      );

      // The Android warning "not attached to an Activity" typically happens when the app is not active.
      if (AppState.currentState !== 'active') return false;
    }

    Alert.alert(opts.title, opts.message, [
      { text: opts.cancelText ?? 'Cancel', style: 'cancel' },
      {
        text: opts.confirmText,
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => {
          // Keep the native API sync; callers can still run async work.
          void Promise.resolve(opts.onConfirm());
        },
      },
    ]);

    return true;
  } catch (e) {
    return false;
  }
}
