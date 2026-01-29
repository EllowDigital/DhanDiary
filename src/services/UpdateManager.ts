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
      } catch (e) {}
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
      const result = await Updates.checkForUpdateAsync();

      if (result.isAvailable) {
        // Found update -> Auto download
        this.setState('DOWNLOADING');
        await Updates.fetchUpdateAsync();
        this.setState('READY');
        return true;
      } else {
        this.setState('IDLE');
        return false;
      }
    } catch (error) {
      console.warn('[UpdateManager] Manual check failed', error);
      this.setState('ERROR');
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
    if (now - this.lastCheck < this.MIN_CHECK_INTERVAL) return;

    try {
      this.lastCheck = now;
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        this.setState('READY'); // UI shows badge, doesn't force reload
      }
    } catch (e) {
      // Silent fail
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
