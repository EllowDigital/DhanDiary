import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInternetStatus } from '../hooks/useInternetStatus';
import {
  subscribeSyncStatus,
  SyncStatus,
  getLastSuccessfulSyncAt,
  getLastSyncTime,
} from '../services/syncManager';
import { getNeonHealth } from '../api/neonClient';
import { colors, shadows } from '../utils/design';
import { setBannerVisible } from '../utils/bannerState';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type BannerState = 'offline' | 'syncing' | 'synced' | 'hidden' | 'error';

interface BannerConfig {
  text: string;
  subtext?: string;
  icon: keyof typeof MaterialIcon.glyphMap;
  iconColor: string;
  dotColor?: string;
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
  const visibility = useRef(new Animated.Value(0)).current;

  // Render state: keep last non-hidden state mounted so we can animate out
  const [renderState, setRenderState] = useState<BannerState>('hidden');

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

      const isNeonLikelyUnreachable = (() => {
        try {
          const h = getNeonHealth();
          const msg = String(h.lastErrorMessage || '').toLowerCase();
          const circuitOpen = !!h.circuitOpenUntil && h.circuitOpenUntil > Date.now();
          return (
            circuitOpen ||
            msg.includes('offline') ||
            msg.includes('network request failed') ||
            msg.includes('timed out') ||
            msg.includes('timeout') ||
            msg.includes('fetch') ||
            msg.includes('connection')
          );
        } catch (e) {
          return false;
        }
      })();

      // --- Priority Logic ---
      if (!isOnline) {
        nextState = 'offline';
      } else if (syncStatus === 'error') {
        // If the internet is "up" but Neon is unreachable (slow/blocked DNS/captive portal),
        // show a calm offline-style status rather than an alarming failure.
        nextState = isNeonLikelyUnreachable ? 'offline' : 'error';
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
      if (nextState !== bannerState) setBannerState(nextState);

      // --- Auto-Hide Logic for "Synced" Only ---
      if (nextState === 'synced') {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
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

  // Banner visibility is now overlay-only; keep global banner visibility false
  // so screens do not change their safe-area/layout.
  useEffect(() => {
    setBannerVisible(false);
    return () => setBannerVisible(false);
  }, []);

  // Animate in/out without affecting layout.
  useEffect(() => {
    if (bannerState === 'hidden') {
      Animated.timing(visibility, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setRenderState('hidden');
      });
      return;
    }

    // If becoming visible, ensure it is mounted first.
    setRenderState(bannerState);
    Animated.timing(visibility, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [bannerState, visibility]);

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
    switch (renderState) {
      case 'offline':
        return {
          icon: 'wifi-off',
          iconColor: colors.accentRed,
          text: 'Offline',
          subtext: 'Will sync when online',
          showIndicator: true,
          dotColor: colors.accentRed,
        };
      case 'syncing':
        return {
          icon: 'autorenew',
          text: 'Syncing...',
          subtext: 'Working in background',
          iconColor: colors.primary,
        };
      case 'error':
        return {
          icon: 'error-outline',
          text: 'Sync Failed',
          subtext: 'Will retry automatically',
          iconColor: colors.accentRed,
        };
      case 'synced':
        return {
          icon: 'check',
          text: 'Up to date',
          subtext: lastSyncAt ? `Synced ${formatRelativeTime(lastSyncAt)}` : undefined,
          iconColor: colors.accentGreen,
        };
      default:
        return { icon: 'check', text: '', iconColor: colors.muted };
    }
  };

  const config = getConfig();
  const isSpinning = renderState === 'syncing';

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

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  /* ------------------------- Render ------------------------------------------- */
  if (renderState === 'hidden') return null;

  const translateY = visibility.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  return (
    <View pointerEvents="none" style={styles.wrapper}>
      <Animated.View
        style={[
          styles.pill,
          {
            marginBottom: insets.bottom + 10,
            opacity: visibility,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.contentRow}>
          <View style={styles.iconWrapper}>
            <Animated.View style={{ transform: [{ rotate: isSpinning ? spin : '0deg' }] }}>
              <MaterialIcon name={config.icon} size={18} color={config.iconColor} />
            </Animated.View>
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.title}>{config.text}</Text>
            {config.subtext ? <Text style={styles.subtitle}>{config.subtext}</Text> : null}
          </View>

          {config.showIndicator ? (
            <View style={styles.rightElement}>
              <View
                style={[styles.liveDot, { backgroundColor: config.dotColor || colors.accentRed }]}
              />
            </View>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 999,
    alignItems: 'center',
  },
  pill: {
    maxWidth: 420,
    width: '92%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    ...shadows.small,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
    color: colors.muted,
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
  },
});

export default SyncStatusBanner;
