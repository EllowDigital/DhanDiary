import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  LayoutAnimation,
  UIManager,
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

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* -------------------------------------------------------------------------- */
/* Types                                   */
/* -------------------------------------------------------------------------- */

type BannerState = 'offline' | 'syncing' | 'synced' | 'hidden' | 'error';

interface BannerConfig {
  bg: string;
  text: string;
  subtext?: string;
  icon: keyof typeof MaterialIcon.glyphMap;
  color: string;
  accent: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                 */
/* -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 400; // Delay before showing state change to prevent flickering
const SHOW_SYNCED_MS = 2000; // Duration to show "Synced" success message
const ANIMATION_DURATION = 300;

/* -------------------------------------------------------------------------- */
/* Helpers                                    */
/* -------------------------------------------------------------------------- */

const formatRelativeTime = (ts: number) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 5 * 1000) return 'just now';
  if (diff < 60 * 1000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* -------------------------------------------------------------------------- */
/* Main Component                               */
/* -------------------------------------------------------------------------- */

const SyncStatusBanner = () => {
  const isOnline = useInternetStatus();
  const insets = useSafeAreaInsets();
  
  // State
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [bannerState, setBannerState] = useState<BannerState>('hidden');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  // Animation Values
  // We use translateY to slide it in from top (-100) to 0
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Refs for timers
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------- 1. Listen to Sync Manager ------------------------ */
  useEffect(() => {
    const unsub = subscribeSyncStatus((s) => {
      setSyncStatus(s);
    });
    return () => {
      try {
        unsub();
      } catch (e) {
        // safety catch
      }
    };
  }, []);

  /* ------------------------- 2. Determine Banner State ------------------------ */
  useEffect(() => {
    // Clear existing debounce timer
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Debounce the state calculation to avoid rapid UI flashing
    debounceRef.current = setTimeout(() => {
      let nextState: BannerState = 'hidden';

      // Priority Logic:
      // 1. Offline (Highest Priority)
      // 2. Error
      // 3. Syncing
      // 4. Synced (Transient)

      if (!isOnline) {
        nextState = 'offline';
      } else if (syncStatus === 'error') {
        nextState = 'error';
      } else if (syncStatus === 'syncing') {
        nextState = 'syncing';
      } else {
        // If we were previously syncing or had an error, and now we are idle/success,
        // we show the "synced" success state briefly.
        // We only transition to 'synced' if the PREVIOUS state wasn't hidden/offline 
        // to avoid showing "Synced" immediately on app launch.
        if (bannerState === 'syncing' || bannerState === 'error') {
           nextState = 'synced';
        } else if (bannerState === 'synced') {
           // Keep it synced until timer runs out
           nextState = 'synced';
        } else {
           nextState = 'hidden';
        }
      }

      // Handle the transition logic
      if (nextState === 'synced') {
        setBannerState('synced');
        
        // Schedule auto-hide
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          setBannerState('hidden');
        }, SHOW_SYNCED_MS);
      } else {
        // For all other states, cancel the auto-hide timer
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        setBannerState(nextState);
      }

    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOnline, syncStatus, bannerState]);

  /* ------------------------- 3. Fetch Last Sync Time ------------------------ */
  useEffect(() => {
    let mounted = true;
    const loadTime = async () => {
      if (bannerState !== 'synced') return;
      
      // Try in-memory first
      const inMem = getLastSuccessfulSyncAt && getLastSuccessfulSyncAt();
      if (inMem) {
        if (mounted) setLastSyncAt(inMem);
        return;
      }

      // Fallback to storage
      try {
        const v = await getLastSyncTime();
        if (v && mounted) {
          const n = Number(v);
          if (!isNaN(n)) setLastSyncAt(n);
        }
      } catch (e) {
        // ignore
      }
    };

    if (bannerState === 'synced') {
      loadTime();
    }

    return () => { mounted = false; };
  }, [bannerState]);

  /* ------------------------- 4. Run Animations ------------------------ */
  useEffect(() => {
    const isVisible = bannerState !== 'hidden';

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: isVisible ? 0 : -100, // 0 is natural position, -100 is pushed up
        duration: ANIMATION_DURATION,
        easing: Easing.out(Easing.poly(4)),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: isVisible ? 1 : 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start();
  }, [bannerState, slideAnim, opacityAnim]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  /* ------------------------- 5. Render Configuration ------------------------ */
  const getConfig = (): BannerConfig => {
    switch (bannerState) {
      case 'offline':
        return {
          bg: '#1F2937', // Dark Grey (Modern Dark Mode feel)
          color: '#F3F4F6',
          accent: '#9CA3AF',
          icon: 'cloud-off',
          text: 'You are offline',
          subtext: 'Changes saved locally',
        };
      case 'syncing':
        return {
          bg: '#EFF6FF', // Light Blue
          color: '#1E40AF',
          accent: '#3B82F6',
          icon: 'sync',
          text: 'Syncing changes...',
          subtext: 'Keeping data up to date',
        };
      case 'error':
        return {
          bg: '#FEF2F2', // Light Red
          color: '#991B1B',
          accent: '#EF4444',
          icon: 'error-outline',
          text: 'Sync failed',
          subtext: 'Retrying automatically...',
        };
      case 'synced':
        return {
          bg: '#ECFDF5', // Light Emerald
          color: '#065F46',
          accent: '#10B981',
          icon: 'check-circle',
          text: 'All changes synced',
          subtext: lastSyncAt ? `Last synced ${formatRelativeTime(lastSyncAt)}` : 'Up to date',
        };
      default:
        // Hidden state fallback
        return { bg: 'transparent', color: 'transparent', accent: 'transparent', icon: 'check', text: '' };
    }
  };

  const config = getConfig();
  const isSpinning = bannerState === 'syncing';

  // Rotation animation for sync icon
  const spinValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isSpinning) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [isSpinning, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  /* ------------------------- Render ------------------------ */
  // We strictly don't render null, but rely on opacity/translate to hide it
  // This ensures the exit animation plays correctly.
  
  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: config.bg,
          paddingTop: insets.top + 8, // Respect Safe Area + Padding
          paddingBottom: 10,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={styles.contentContainer}>
        <Animated.View
          style={{
            transform: [{ rotate: isSpinning ? spin : '0deg' }],
          }}
        >
          <MaterialIcon name={config.icon} size={20} color={config.color} />
        </Animated.View>

        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: config.color }]}>
            {config.text}
          </Text>
          {config.subtext ? (
            <Text style={[styles.subtitle, { color: config.color, opacity: 0.8 }]}>
              {config.subtext}
            </Text>
          ) : null}
        </View>

        {/* Optional Right Indicator (e.g., a small dot or close) */}
        {bannerState === 'offline' && (
          <View style={[styles.indicator, { backgroundColor: '#EF4444' }]} />
        )}
      </View>
      
      {/* Subtle bottom border line */}
      <View style={[styles.bottomLine, { backgroundColor: config.color, opacity: 0.1 }]} />
    </Animated.View>
  );
};

/* -------------------------------------------------------------------------- */
/* Styles                                   */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999, // Ensure it sits on top of everything
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  textContainer: {
    marginLeft: 12,
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  bottomLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});

export default SyncStatusBanner;