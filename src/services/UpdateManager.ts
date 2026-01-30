import * as Updates from 'expo-updates';
import { Alert, AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '../utils/AsyncStorageWrapper';

export type UpdateState = 'IDLE' | 'CHECKING' | 'DOWNLOADING' | 'READY' | 'ERROR';

type StateListener = (state: UpdateState) => void;

class UpdateManager {
  private static instance: UpdateManager;
  private state: UpdateState = 'IDLE';
  private listeners: Set<StateListener> = new Set();
  private lastCheck = 0;
  private appStateSub: any = null;

  // Configuration
  private MIN_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  private STORAGE_KEY = 'last_update_check_ts';
  private FAILED_UPDATE_KEY = 'failed_ota_update_id';
  private TIMEOUT_MS = 15000; // 15s timeout for checks

  private constructor() { }

  public static getInstance(): UpdateManager {
    if (!UpdateManager.instance) {
      UpdateManager.instance = new UpdateManager();
    }
    return UpdateManager.instance;
  }

  /**
   * Initialize the UpdateManager.
   * Sets up AppState listeners to check for updates on resume.
   */
  public setup() {
    if (this.appStateSub) return; // Already setup

    this.log('Setting up UpdateManager lifecycle listeners');
    this.appStateSub = AppState.addEventListener('change', this.handleAppStateChange);

    // Initial check on startup (throttled)
    this.checkForUpdateBackground().catch(() => { });
  }

  public teardown() {
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      this.checkForUpdateBackground().catch(() => { });
    }
  };

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state); // Emit current immediately
    return () => this.listeners.delete(listener);
  }

  private setState(s: UpdateState) {
    if (this.state === s) return;
    this.log(`State change: ${this.state} -> ${s}`);
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

  private log(msg: string, data?: any) {
    if (__DEV__) {
      if (data) console.log(`[UpdateManager] ${msg}`, data);
      else console.log(`[UpdateManager] ${msg}`);
    }
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
      this.log('Manual check failed', error);
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
    // Don't interrupt if already busy or in error state (wait for manual reset or next app launch)
    if (this.state !== 'IDLE') return;

    // 1. Network Check
    const net = await NetInfo.fetch();
    if (!net.isConnected || !net.isInternetReachable) {
      this.log('Offline, skipping background check');
      return;
    }

    // 2. Throttle Check
    const now = Date.now();
    try {
      const lastStr = await AsyncStorage.getItem(this.STORAGE_KEY);
      const last = lastStr ? Number(lastStr) : 0;
      if (now - last < this.MIN_CHECK_INTERVAL) {
        // Silent throttle
        return;
      }
    } catch (e) {
      // ignore storage error, proceed cautiously
    }

    // Update timestamp immediately to prevent rapid retries
    this.lastCheck = now;
    AsyncStorage.setItem(this.STORAGE_KEY, String(now)).catch(() => { });

    try {
      this.setState('CHECKING');

      // 3. Check for Update
      const result = await Promise.race([
        Updates.checkForUpdateAsync(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), this.TIMEOUT_MS)
        ),
      ]);

      if ((result as any).isAvailable) {
        const updateId = (result as any).manifest?.id || 'unknown';

        // 4. Update Loop Guard
        const failedId = await AsyncStorage.getItem(this.FAILED_UPDATE_KEY);
        if (failedId === updateId) {
          this.log('Skipping previously failed update', updateId);
          this.setState('IDLE');
          return;
        }

        // Notify listeners so we can show "Updating..." toast
        this.setState('DOWNLOADING');

        await Promise.race([
          Updates.fetchUpdateAsync(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), this.TIMEOUT_MS * 4) // Longer timeout for download
          ),
        ]);

        this.setState('READY'); // UI shows badge/toast
      } else {
        this.setState('IDLE');
      }
    } catch (e) {
      this.log('Background check failed', e);
      // Reset to IDLE so we don't get stuck in CHECKING/DOWNLOADING
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
      this.log('Reloading app to apply update...');
      await Updates.reloadAsync();
    } catch (e) {
      Alert.alert('Update Failed', 'Could not reload the app. Please restart manually.');
    }
  }

  /**
   * Call this if the App detects a crash loop or similar (advanced).
   */
  public async reportBadUpdate(updateId: string) {
    try {
      await AsyncStorage.setItem(this.FAILED_UPDATE_KEY, updateId);
    } catch (e) { }
  }
}

export default UpdateManager.getInstance();
