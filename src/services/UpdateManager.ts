import * as Updates from 'expo-updates';
import { Alert } from 'react-native';
import AsyncStorage from '../utils/AsyncStorageWrapper';

export type UpdateState = 'IDLE' | 'CHECKING' | 'DOWNLOADING' | 'READY' | 'ERROR';

type StateListener = (state: UpdateState) => void;

class UpdateManager {
  private static instance: UpdateManager;
  private state: UpdateState = 'IDLE';
  private listeners: Set<StateListener> = new Set();
  private lastCheck = 0;

  private MIN_CHECK_INTERVAL = 30 * 60 * 1000; // 30 mins
  private STORAGE_KEY = 'last_update_check_ts';
  private TIMEOUT_MS = 15000; // 15s timeout for checks

  private constructor() {}

  public static getInstance(): UpdateManager {
    if (!UpdateManager.instance) {
      UpdateManager.instance = new UpdateManager();
    }
    return UpdateManager.instance;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state); // Emit current immediately
    return () => this.listeners.delete(listener);
  }

  private setState(s: UpdateState) {
    if (this.state === s) return;
    this.state = s;
    this.listeners.forEach((l) => {
      try {
        l(s);
      } catch (e) {
        if (__DEV__) console.warn('[UpdateManager] Listener error:', e);
      }
    });
  }

  public getState() {
    return this.state;
  }

  /**
   * Manual check triggered by user (About Screen).
   * Forces a check even if recently checked.
   */
  public async checkForUpdateManual(): Promise<boolean> {
    if (this.state === 'DOWNLOADING' || this.state === 'CHECKING') return false;

    // Expo Go check
    if (__DEV__) {
      console.log('[UpdateManager] Skipping check in DEV/Expo Go');
      return false;
    }

    try {
      this.setState('CHECKING');

      const checkResult = await Promise.race([
        Updates.checkForUpdateAsync(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Check Timeout')), this.TIMEOUT_MS)
        ),
      ]);

      if ((checkResult as any).isAvailable) {
        // Found update -> Auto download
        this.setState('DOWNLOADING');
        await Promise.race([
          Updates.fetchUpdateAsync(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Download Timeout')), this.TIMEOUT_MS * 2)
          ),
        ]);

        this.setState('READY');
        return true;
      } else {
        this.setState('IDLE');
        return false;
      }
    } catch (error) {
      console.warn('[UpdateManager] Manual check failed', error);
      // Show error state briefly, then reset to IDLE so user can retry immediately
      this.setState('ERROR');
      setTimeout(() => {
         this.setState('IDLE');
      }, 2000);
      return false;
    }
  }

  /**
   * Background check (e.g. app resume).
   * Silent, fails safely, respects throttle.
   */
  public async checkForUpdateBackground() {
    if (__DEV__) return;
    if (this.state !== 'IDLE' && this.state !== 'ERROR') return; // Don't interrupt

    const now = Date.now();

    try {
      const lastStr = await AsyncStorage.getItem(this.STORAGE_KEY);
      const last = lastStr ? Number(lastStr) : 0;
      if (now - last < this.MIN_CHECK_INTERVAL) {
        if (__DEV__) console.log('[UpdateManager] Throttled background check');
        return;
      }
    } catch (e) {
      // ignore storage error, proceed cautiously
    }

    // Prevent race condition if multiple calls happen quickly
    this.lastCheck = now;
    AsyncStorage.setItem(this.STORAGE_KEY, String(now)).catch(() => {});

    try {
      const result = await Promise.race([
        Updates.checkForUpdateAsync(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.TIMEOUT_MS)
        ),
      ]);

      if ((result as any).isAvailable) {
        await Promise.race([
          Updates.fetchUpdateAsync(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.TIMEOUT_MS * 2)
          ),
        ]);
        this.setState('READY'); // UI shows badge, doesn't force reload
      } else {
        // Explicitly set IDLE to notify listeners if needed, though usually state is already IDLE/ERROR
        this.setState('IDLE');
      }
    } catch (e) {
      // Don't leave it in a potential unknown state, though here we didn't change state yet.
      // If we want to allow retries sooner on error, we could reset lastCheck or just leave it.
      // Setting state to ERROR allows UI to show error status if it wants to.
      // But for background, better to just be quiet unless we want to show a warning badge.
      // We'll set IDLE so we aren't stuck.
      this.setState('IDLE');
    }
  }

  /**
   * Reloads the app to apply the new bundle.
   * THIS IS THE DANGEROUS PART - Only call when "safe".
   */
  public async reload() {
    if (this.state !== 'READY') return;

    try {
      await Updates.reloadAsync();
    } catch (e) {
      Alert.alert('Update Failed', 'Could not reload the app. Please restart manually.');
    }
  }
}

export default UpdateManager.getInstance();
