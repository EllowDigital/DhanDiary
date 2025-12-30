import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useInternetStatus } from '../hooks/useInternetStatus';
import { subscribeSyncStatus } from '../services/syncManager';
import { colors } from '../utils/design';

const SyncStatusBanner = () => {
    const isOnline = useInternetStatus();
    const [syncing, setSyncing] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const unsub = subscribeSyncStatus((running) => {
            setSyncing(running);
            setVisible(true);
            // hide banner shortly after finish
            if (!running) {
                setTimeout(() => setVisible(false), 1800);
            }
        });
        return unsub;
    }, []);

    if (!visible && !(!isOnline && !syncing)) return null;

    const bg = !isOnline ? '#FEE2E2' : syncing ? '#EFF6FF' : '#ECFDF5';
    const iconColor = !isOnline ? '#B91C1C' : syncing ? '#1D4ED8' : '#065F46';
    const text = !isOnline ? 'Offline mode' : syncing ? 'Syncing…' : 'All changes synced';

    return (
        <Animated.View style={[styles.container, { backgroundColor: bg }]}>
            <View style={styles.inner}>
                <MaterialIcon name={!isOnline ? 'cloud-off' : syncing ? 'sync' : 'check-circle'} size={16} color={iconColor} />
                <Text style={[styles.text, { color: iconColor }]}>{text}</Text>
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
    },
    inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    text: { marginLeft: 8, fontSize: 13, fontWeight: '600' },
});

export default SyncStatusBanner;
