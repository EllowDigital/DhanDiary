import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '../utils/design';

type Props = {
    visible: boolean;
    message?: string;
    retrying?: boolean;
    attemptsLeft?: number;
    onRetry: () => void;
    onClose?: () => void;
};

const OfflineNotice: React.FC<Props> = ({
    visible,
    message = 'No internet connection. Please check your network and try again.',
    retrying = false,
    attemptsLeft,
    onRetry,
    onClose,
}) => {
    if (!visible) return null;

    return (
        <View style={styles.overlay} pointerEvents="box-none">
            <View style={styles.card}>
                <Text style={styles.title}>Connection Required</Text>
                <Text style={styles.msg}>{message}</Text>

                {typeof attemptsLeft === 'number' && (
                    <Text style={styles.attempts}>Attempts left: {attemptsLeft}</Text>
                )}

                <View style={styles.row}>
                    <TouchableOpacity style={styles.btn} onPress={onRetry} activeOpacity={0.8}>
                        {retrying ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.btnText}>Retry</Text>
                        )}
                    </TouchableOpacity>

                    {onClose && (
                        <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onClose} activeOpacity={0.8}>
                            <Text style={[styles.btnText, styles.cancelText]}>Cancel</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
    },
    card: {
        width: '86%',
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.06,
        shadowRadius: 30,
        elevation: 20,
        alignItems: 'center',
    },
    title: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
    msg: { color: '#475569', textAlign: 'center', marginBottom: 12 },
    attempts: { color: '#64748B', fontSize: 12, marginBottom: 8 },
    row: { flexDirection: 'row', width: '100%', justifyContent: 'center', gap: 12 },
    btn: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        backgroundColor: colors.primary || '#2563EB',
        borderRadius: 12,
    },
    btnText: { color: '#fff', fontWeight: '700' },
    cancel: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0' },
    cancelText: { color: '#475569' },
});

export default OfflineNotice;
