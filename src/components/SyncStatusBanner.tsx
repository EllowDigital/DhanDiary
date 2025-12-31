import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  LayoutAnimation,
  UIManager,
  TouchableOpacity,
} from 'react-native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInternetStatus } from '../hooks/useInternetStatus';
import {
  subscribeSyncStatus,
  SyncStatus,
  getLastSuccessfulSyncAt,
  getLastSyncTime,
} from '../services/syncManager';
import { setBannerVisible } from '../utils/bannerState';

// 1. Enable LayoutAnimation for Android (Critical for smooth header slide)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type BannerState = 'offline' | 'syncing' | 'synced' | 'hidden' | 'error';

interface BannerConfig {
  bg: string;
  text: string;
  subtext?: string;
  icon: keyof typeof MaterialIcon.glyphMap;
  color: string;
  showIndicator?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 500;
const SHOW_SYNCED_MS = 2500;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const formatRelativeTime = (ts: number) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'Just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/* -------------------------------------------------------------------------- */
/* Main Component                                                             */
/* -------------------------------------------------------------------------- */

const SyncStatusBanner = () => {
  const isOnline = useInternetStatus();
  const insets = useSafeAreaInsets();

  // State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [bannerState, setBannerState] = useState<BannerState>('hidden');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Animation: Spin Value for Loading Icon
  const spinValue = useRef(new Animated.Value(0)).current;

  // Refs for timers
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------- 1. Listen to Sync Manager ------------------------ */
  useEffect(() => {
    const unsub = subscribeSyncStatus((s) => setSyncStatus(s));
    return () => {
      try {
        unsub();
      } catch (e) {}
    };
  }, []);

  /* ------------------------- 2. Core State Logic ------------------------------ */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      let nextState: BannerState = 'hidden';

      // --- Priority Logic ---
      if (!isOnline) {
        nextState = 'offline';
      } else if (syncStatus === 'error') {
        nextState = 'error';
      } else if (syncStatus === 'syncing') {
        nextState = 'syncing';
      } else {
        // If transitioning from work state to idle, show "Synced"
        if (['syncing', 'error', 'offline'].includes(bannerState)) {
          nextState = 'synced';
        } else if (bannerState === 'synced') {
          nextState = 'synced'; // Keep showing until timer ends
        } else {
          nextState = 'hidden';
        }
      }

      // --- Transition Handling ---
      if (nextState !== bannerState) {
        // ✨ This is the Magic: Animates layout changes (Height/Position)
        // so the Header slides down smoothly.
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setBannerState(nextState);
      }

      // --- Auto-Hide Logic for "Synced" Only ---
      if (nextState === 'synced') {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setBannerState('hidden');
        }, SHOW_SYNCED_MS);
      } else {
        // For Offline/Syncing/Error -> Cancel hide timer, persist banner
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOnline, syncStatus, bannerState]);

  /* ------------------------- 3. Load Sync Time -------------------------------- */
  useEffect(() => {
    if (bannerState === 'synced') {
      const inMem = getLastSuccessfulSyncAt && getLastSuccessfulSyncAt();
      if (inMem) {
        setLastSyncAt(inMem);
      } else {
        getLastSyncTime()
          .then((v) => {
            if (v && !isNaN(Number(v))) setLastSyncAt(Number(v));
          })
          .catch(() => {});
      }
    }
  }, [bannerState]);

  /* ------------------------- 4. Config & Visuals ------------------------------ */
  const getConfig = (): BannerConfig => {
    switch (bannerState) {
      case 'offline':
        return {
          bg: '#171717', // Modern Deep Black
          color: '#F3F4F6',
          icon: 'wifi-off',
          text: 'No Connection',
          subtext: 'Changes saved to device',
          showIndicator: true,
        };
      case 'syncing':
        return {
          bg: '#2563EB', // Vibrant Royal Blue
          color: '#FFFFFF',
          icon: 'autorenew',
          text: 'Syncing...',
          subtext: 'Updating your data',
        };
      case 'error':
        return {
          bg: '#DC2626', // Modern Red
          color: '#FFFFFF',
          icon: 'error-outline',
          text: 'Sync Failed',
          subtext: 'Tap to retry',
        };
      case 'synced':
        return {
          bg: '#10B981', // Emerald Green
          color: '#FFFFFF',
          icon: 'check',
          text: 'Up to date',
          subtext: lastSyncAt ? `Synced ${formatRelativeTime(lastSyncAt)}` : undefined,
        };
      default:
        return { bg: 'transparent', color: 'transparent', icon: 'check', text: '' };
    }
  };

  const config = getConfig();
  const isSpinning = bannerState === 'syncing';

  // --- Spin Animation ---
  useEffect(() => {
    if (isSpinning) {
      spinValue.setValue(0);
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.stopAnimation();
    }
  }, [isSpinning]);

  // Notify other components (headers) when banner visibility changes
  useEffect(() => {
    setBannerVisible(bannerState !== 'hidden');
  }, [bannerState]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  /* ------------------------- Render ------------------------------------------- */
  if (bannerState === 'hidden') return null;

  return (
    <View style={[styles.wrapper, { backgroundColor: config.bg, paddingTop: insets.top }]}>
      <View style={styles.container}>
        {/* Left: Icon */}
        <View style={styles.iconWrapper}>
          <Animated.View style={{ transform: [{ rotate: isSpinning ? spin : '0deg' }] }}>
            <MaterialIcon name={config.icon} size={22} color={config.color} />
          </Animated.View>
        </View>

        {/* Center: Text */}
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: config.color }]}>{config.text}</Text>
          {config.subtext && (
            <Text style={[styles.subtitle, { color: config.color }]}>{config.subtext}</Text>
          )}
        </View>

        {/* Right: Indicator Dot (for offline) */}
        {config.showIndicator && (
          <View style={styles.rightElement}>
            <View style={styles.liveDot} />
          </View>
        )}
      </View>
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    // Keep default stacking so banner stays in normal layout flow
    // No absolute positioning! This allows it to push content down.
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12, // slightly more vertical breathing room
    minHeight: 56,
  },
  iconWrapper: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2, // Modern tight letter spacing
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
    opacity: 0.85,
  },
  rightElement: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444', // Red dot for offline attention
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});

export default SyncStatusBanner;
