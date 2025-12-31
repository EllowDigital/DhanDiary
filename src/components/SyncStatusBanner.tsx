import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  UIManager,
  LayoutChangeEvent,
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
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type BannerState = 'offline' | 'syncing' | 'synced' | 'hidden' | 'error';

interface BannerConfig {
  bg: string;
  text: string;
  subtext?: string;
  icon: keyof typeof MaterialIcon.glyphMap;
  color: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 300;
const SHOW_SYNCED_MS = 3000;
const ANIMATION_DURATION = 300;
const DEFAULT_HEIGHT = 80; // Fallback height

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const formatRelativeTime = (ts: number) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'just now';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  
  // Height State
  const [contentHeight, setContentHeight] = useState<number>(DEFAULT_HEIGHT + insets.top);

  // Animation Values: 0 = Hidden, 1 = Visible
  const animController = useRef(new Animated.Value(0)).current;

  // Refs
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 1. Sync Listener ---
  useEffect(() => {
    const unsub = subscribeSyncStatus((s) => setSyncStatus(s));
    return () => { try { unsub(); } catch (e) {} };
  }, []);

  // --- 2. State Logic ---
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      let nextState: BannerState = 'hidden';

      if (!isOnline) {
        nextState = 'offline';
      } else if (syncStatus === 'error') {
        nextState = 'error';
      } else if (syncStatus === 'syncing') {
        nextState = 'syncing';
      } else if (bannerState !== 'hidden') {
        // Only show 'synced' success if we were previously showing something else
        nextState = 'synced';
      }

      // Logic to auto-hide 'synced' state
      if (nextState === 'synced') {
        setBannerState('synced');
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          setBannerState('hidden');
        }, SHOW_SYNCED_MS);
      } else {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        setBannerState(nextState);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOnline, syncStatus, bannerState]);

  // --- 3. Animation Driver ---
  useEffect(() => {
    const isVisible = bannerState !== 'hidden';
    
    Animated.timing(animController, {
      toValue: isVisible ? 1 : 0,
      duration: ANIMATION_DURATION,
      easing: Easing.out(Easing.poly(4)),
      useNativeDriver: false, // Height prop needs false
    }).start();
  }, [bannerState, animController]);

  // --- 4. Get Last Sync Time ---
  useEffect(() => {
    if (bannerState === 'synced') {
      const inMem = getLastSuccessfulSyncAt?.();
      if (inMem) setLastSyncAt(inMem);
      else {
        getLastSyncTime().then((v) => {
          const n = Number(v);
          if (!isNaN(n)) setLastSyncAt(n);
        }).catch(() => {});
      }
    }
  }, [bannerState]);

  // --- 5. Config ---
  const config = useMemo((): BannerConfig => {
    switch (bannerState) {
      case 'offline':
        return {
          bg: '#1F2937',
          color: '#F3F4F6',
          icon: 'cloud-off',
          text: 'You are offline',
          subtext: 'Changes saved locally',
        };
      case 'syncing':
        return {
          bg: '#EFF6FF',
          color: '#1E40AF',
          icon: 'sync',
          text: 'Syncing changes...',
          subtext: 'Keeping data up to date',
        };
      case 'error':
        return {
          bg: '#FEF2F2',
          color: '#991B1B',
          icon: 'error-outline',
          text: 'Sync failed',
          subtext: 'Retrying automatically...',
        };
      case 'synced':
        return {
          bg: '#ECFDF5',
          color: '#065F46',
          icon: 'check-circle',
          text: 'All changes synced',
          subtext: lastSyncAt ? `Last synced ${formatRelativeTime(lastSyncAt)}` : 'Up to date',
        };
      default:
        // Return a neutral config instead of transparent to prevent text vanishing during exit
        return {
          bg: '#ECFDF5',
          color: '#065F46',
          icon: 'check-circle',
          text: 'All changes synced',
        };
    }
  }, [bannerState, lastSyncAt]);

  // Height Interpolation
  const heightAnim = animController.interpolate({
    inputRange: [0, 1],
    outputRange: [0, contentHeight],
  });

  const opacityAnim = animController.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0, 1],
  });

  // Spin Animation for Sync Icon
  const spinValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (bannerState === 'syncing') {
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
      spinValue.setValue(0);
    }
  }, [bannerState]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          height: heightAnim,
          backgroundColor: config.bg,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.innerContent,
          {
            opacity: opacityAnim,
            paddingTop: insets.top > 0 ? insets.top + 6 : 12, // Safe area padding
          },
        ]}
        onLayout={(e: LayoutChangeEvent) => {
          // Dynamically measure height to support multiline text
          const h = e.nativeEvent.layout.height;
          if (h > 0 && Math.abs(h - contentHeight) > 2) {
            setContentHeight(h);
          }
        }}
      >
        <View style={styles.row}>
          <Animated.View style={{ transform: [{ rotate: bannerState === 'syncing' ? spin : '0deg' }] }}>
            <MaterialIcon name={config.icon} size={20} color={config.color} />
          </Animated.View>

          <View style={styles.textStack}>
            <Text style={[styles.title, { color: config.color }]}>
              {config.text}
            </Text>
            {config.subtext ? (
              <Text style={[styles.subtitle, { color: config.color, opacity: 0.85 }]}>
                {config.subtext}
              </Text>
            ) : null}
          </View>

          {bannerState === 'offline' && (
            <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
          )}
        </View>
        
        {/* Bottom Border Line */}
        <View style={[styles.borderLine, { backgroundColor: config.color, opacity: 0.1 }]} />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    overflow: 'hidden',
    zIndex: 9999, // Ensure it's on top
    // No absolute positioning here so it pushes content down. 
    // To overlay, add `position: 'absolute', top: 0, left: 0, right: 0`
  },
  innerContent: {
    width: '100%',
    paddingBottom: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textStack: {
    marginLeft: 12,
    flex: 1,
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 10,
  },
  borderLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
});

export default SyncStatusBanner;