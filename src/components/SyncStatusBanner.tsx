import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useInternetStatus } from '../hooks/useInternetStatus';
import { subscribeSyncStatus } from '../services/syncManager';
import { colors } from '../utils/design';

type BannerState = 'offline' | 'syncing' | 'synced' | 'hidden' | 'error';

const DEBOUNCE_MS = 400; // avoid flicker
const SHOW_SYNCED_MS = 1400; // how long to show "All changes synced" before hiding

const SyncStatusBanner = () => {
  const isOnline = useInternetStatus();
  const [remoteRunning, setRemoteRunning] = useState(false);
  const [state, setState] = useState<BannerState>('hidden');
  const debounceRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  // Subscribe to sync manager running state
  useEffect(() => {
    const unsub = subscribeSyncStatus((running) => {
      setRemoteRunning(Boolean(running));
    });
    return () => {
      try {
        unsub();
      } catch (e) {}
    };
  }, []);

  // Derive banner state with debounce to prevent flicker
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    debounceRef.current = setTimeout(() => {
      // Offline has highest priority
      if (!isOnline) {
        setState('offline');
        return;
      }

      // Online + syncing
      if (remoteRunning) {
        setState('syncing');
        return;
      }

      // Online + idle -> briefly show "synced" then hide
      setState('synced');
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      hideTimerRef.current = setTimeout(
        () => setState('hidden'),
        SHOW_SYNCED_MS
      ) as unknown as number;
    }, DEBOUNCE_MS) as unknown as number;

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current as number);
        debounceRef.current = null;
      }
    };
  }, [isOnline, remoteRunning]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current as number);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current as number);
    };
  }, []);

  if (state === 'hidden') return null;

  const mapping: Record<BannerState, { bg: string; text: string; icon: string; color: string }> = {
    offline: { bg: '#F3F4F6', text: 'Offline mode', icon: 'cloud-off', color: '#374151' },
    syncing: { bg: '#EFF6FF', text: 'Syncing…', icon: 'sync', color: '#1D4ED8' },
    synced: { bg: '#ECFDF5', text: 'All changes synced', icon: 'check-circle', color: '#065F46' },
    error: {
      bg: '#FFF7ED',
      text: 'Sync failed — retrying',
      icon: 'error-outline',
      color: '#B45309',
    },
    hidden: { bg: '#fff', text: '', icon: 'check-circle', color: '#000' },
  };

  const cfg = mapping[state];

  return (
    <Animated.View style={[styles.container, { backgroundColor: cfg.bg }]} pointerEvents="box-none">
      <View style={styles.inner}>
        <MaterialIcon name={cfg.icon as any} size={16} color={cfg.color} />
        <Text style={[styles.text, { color: cfg.color }]}>{cfg.text}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
    zIndex: 9999,
  },
  inner: { flexDirection: 'row', alignItems: 'center' },
  text: { marginLeft: 8, fontSize: 13, fontWeight: '600' },
});

export default SyncStatusBanner;
