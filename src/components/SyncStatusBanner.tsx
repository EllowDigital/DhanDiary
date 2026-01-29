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
import { subscribeSession } from '../utils/sessionEvents';
import { getSession } from '../db/session';

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
  bgColor?: string;
  borderColor?: string;
  titleColor?: string;
  subtitleColor?: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 500;
const SHOW_SYNCED_MS = 2500;
const SHOW_OFFLINE_MS = 5000;
const SHOW_SYNCING_MS = 5000;

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
  const spinAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Render state: keep last non-hidden state mounted so we can animate out
  const [renderState, setRenderState] = useState<BannerState>('hidden');

  // Refs for timers
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hide banner if user signs out (no valid local session)
  const hasSessionRef = useRef<boolean>(true);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const s: any = await getSession();
        const ok = !!(s && s.id);
        if (mounted) hasSessionRef.current = ok;
        if (!ok) {
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }

          // Immediately hide any banner on sign out
          setBannerState('hidden');
          setRenderState('hidden');
          try {
            spinAnimRef.current?.stop();
          } catch (e) { }
          spinAnimRef.current = null;
          try {
            spinValue.stopAnimation();
          } catch (e) { }
          spinValue.setValue(0);
          try {
            visibility.setValue(0);
          } catch (e) { }
        }
      } catch (e) {
        // ignore
      }
    };

    void refresh();
    const unsub = subscribeSession(() => {
      void refresh();
    });
    return () => {
      mounted = false;
      try {
        unsub();
      } catch (e) { }
    };
  }, [spinValue, visibility]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      try {
        spinAnimRef.current?.stop();
      } catch (e) { }
      spinAnimRef.current = null;
      try {
        spinValue.stopAnimation();
      } catch (e) { }
      spinValue.setValue(0);
      try {
        visibility.stopAnimation();
      } catch (e) { }
    };
  }, [spinValue, visibility]);

  // Offline should not be a persistent banner that blocks headers.
  // Show it once per offline period, then keep hidden until back online.
  const offlineDismissedRef = useRef(false);

  // Syncing should also be a short notification (avoid covering headers).
  // Show it once per sync cycle, then keep hidden until sync status changes.
  const syncingDismissedRef = useRef(false);

  useEffect(() => {
    if (isOnline) {
      offlineDismissedRef.current = false;
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }
  }, [isOnline]);

  useEffect(() => {
    // When we leave the syncing state, allow showing syncing again next time.
    if (syncStatus !== 'syncing') syncingDismissedRef.current = false;
  }, [syncStatus]);

  /* ------------------------- 1. Listen to Sync Manager ------------------------ */
  useEffect(() => {
    const unsub = subscribeSyncStatus((s) => setSyncStatus(s));
    return () => {
      try {
        unsub();
      } catch (e) { }
    };
  }, []);

  /* ------------------------- 2. Core State Logic ------------------------------ */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      let nextState: BannerState = 'hidden';

      // If signed out, never show banner.
      if (!hasSessionRef.current) {
        if (nextState !== bannerState) setBannerState('hidden');
        return;
      }

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
        nextState = offlineDismissedRef.current ? 'hidden' : 'offline';
      } else if (syncStatus === 'error') {
        // If the internet is "up" but Neon is unreachable (slow/blocked DNS/captive portal),
        // show a calm offline-style status rather than an alarming failure.
        nextState = isNeonLikelyUnreachable ? 'offline' : 'error';
      } else if (syncStatus === 'syncing') {
        nextState = syncingDismissedRef.current ? 'hidden' : 'syncing';
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

      // --- Auto-Hide Logic ---
      // - "Synced" is transient.
      // - "Offline" should be a short notification (do not persist and cover headers).
      if (nextState === 'synced') {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          setBannerState('hidden');
        }, SHOW_SYNCED_MS);
      } else if (nextState === 'offline') {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          offlineDismissedRef.current = true;
          setBannerState('hidden');
        }, SHOW_OFFLINE_MS);
      } else if (nextState === 'syncing') {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
          syncingDismissedRef.current = true;
          setBannerState('hidden');
        }, SHOW_SYNCING_MS);
      } else {
        // For Syncing/Error -> Cancel hide timer, persist banner
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
          .catch(() => { });
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
          text: "You're offline",
          subtext: 'Changes stay on your device',
          showIndicator: true,
          dotColor: colors.accentRed,
          bgColor: colors.accentRedSoft,
          borderColor: colors.accentRed,
          titleColor: colors.text,
          subtitleColor: colors.strongMuted,
        };
      case 'syncing':
        return {
          icon: 'autorenew',
          text: 'Syncing',
          subtext: 'Saving your updates',
          iconColor: colors.primary,
          bgColor: colors.primarySoft,
          borderColor: colors.primary,
          titleColor: colors.text,
          subtitleColor: colors.strongMuted,
        };
      case 'error': {
        // Retrieve the latest specific error from the sync client to help the user debug.
        const health = getNeonHealth();
        const errorMsg = health.lastErrorMessage
          ? String(health.lastErrorMessage).slice(0, 60) // Truncate to fit UI
          : 'Will retry automatically';

        return {
          icon: 'error-outline',
          text: 'Sync paused',
          subtext: errorMsg,
          iconColor: colors.accentRed,
          bgColor: colors.accentRedSoft,
          borderColor: colors.accentRed,
          titleColor: colors.text,
          subtitleColor: colors.strongMuted,
        };
      }
      case 'synced':
        return {
          icon: 'check',
          text: 'All set',
          subtext: lastSyncAt ? `Last sync: ${formatRelativeTime(lastSyncAt)}` : 'Up to date',
          iconColor: colors.accentGreen,
          bgColor: colors.accentGreenSoft,
          borderColor: colors.accentGreen,
          titleColor: colors.text,
          subtitleColor: colors.strongMuted,
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
      // Stop any previous loop before starting a new one
      try {
        spinAnimRef.current?.stop();
      } catch (e) { }

      const anim = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinAnimRef.current = anim;
      anim.start();
    } else {
      // Ensure we fully stop the loop and reset to avoid icons looking rotated
      // when quickly switching states.
      try {
        spinAnimRef.current?.stop();
      } catch (e) { }
      spinAnimRef.current = null;
      try {
        spinValue.stopAnimation();
      } catch (e) { }
      spinValue.setValue(0);
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
    outputRange: [-10, 0],
  });

  return (
    <View pointerEvents="none" style={styles.wrapper}>
      <Animated.View
        style={[
          styles.pill,
          {
            marginTop: insets.top + 10,
            opacity: visibility,
            transform: [{ translateY }],
            backgroundColor: config.bgColor || colors.card,
            borderColor: config.borderColor || colors.border,
          },
        ]}
      >
        <View style={styles.contentRow}>
          <View style={styles.iconWrapper}>
            {isSpinning ? (
              <Animated.View style={{ transform: [{ rotate: spin }] }}>
                <MaterialIcon name={config.icon} size={18} color={config.iconColor} />
              </Animated.View>
            ) : (
              <View>
                <MaterialIcon name={config.icon} size={18} color={config.iconColor} />
              </View>
            )}
          </View>

          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: config.titleColor || colors.text }]}>
              {config.text}
            </Text>
            {config.subtext ? (
              <Text style={[styles.subtitle, { color: config.subtitleColor || colors.muted }]}>
                {config.subtext}
              </Text>
            ) : null}
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
    top: 0,
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
