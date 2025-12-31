import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Animated,
    Modal,
    Dimensions,
    Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../utils/design';

// --- Types ---
type Props = {
    visible: boolean;
    message?: string;
    retrying?: boolean;
    attemptsLeft?: number;
    onRetry: () => void;
    onClose?: () => void;
};

// --- Component ---
const OfflineNotice: React.FC<Props> = ({
    visible,
    message = 'No internet connection detected. Please check your settings.',
    retrying = false,
    attemptsLeft,
    onRetry,
    onClose,
}) => {
    // Animation Values
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 8,
                    tension: 40,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 150,
                useNativeDriver: true,
            }).start(() => scaleAnim.setValue(0.9));
        }
    }, [visible]);

    if (!visible) return null;

    return (
        <Modal transparent animationType="none" visible={visible} statusBarTranslucent>
            {/* Backdrop */}
            <View style={styles.backdrop}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />

                {/* Animated Card */}
                <Animated.View
                    style={[
                        styles.card,
                        { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
                    ]}
                >
                    {/* Icon Header */}
                    <View style={styles.iconCircle}>
                        <MaterialIcons name="wifi-off" size={32} color="#EF4444" />
                    </View>

                    {/* Text Content */}
                    <Text style={styles.title}>Connection Lost</Text>
                    <Text style={styles.message}>{message}</Text>

                    {typeof attemptsLeft === 'number' && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{attemptsLeft} attempts remaining</Text>
                        </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.buttonRow}>
                        {onClose && (
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={onClose}
                                activeOpacity={0.7}
                                disabled={retrying}
                            >
                                <Text style={styles.cancelText}>Dismiss</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[styles.retryButton, !onClose && { flex: 1 }]}
                            onPress={onRetry}
                            activeOpacity={0.8}
                            disabled={retrying}
                        >
                            {retrying ? (
                                <ActivityIndicator color="#FFF" size="small" />
                            ) : (
                                <>
                                    <MaterialIcons name="refresh" size={18} color="#FFF" style={{ marginRight: 6 }} />
                                    <Text style={styles.retryText}>Try Again</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

// --- Styles ---
const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Platform.OS === 'android' ? 'transparent' : undefined,
    },
    card: {
        width: Math.min(Dimensions.get('window').width - 48, 360),
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        // Modern Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 24,
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FEF2F2', // Light red bg
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#FEE2E2',
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: '#1E293B',
        marginBottom: 8,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    message: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 22,
    },
    badge: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 20,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
    },
    buttonRow: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
    },
    retryButton: {
        flex: 1,
        backgroundColor: colors.primary || '#2563EB',
        borderRadius: 14,
        height: 50,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: colors.primary || '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    retryText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    cancelText: {
        color: '#64748B',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default OfflineNotice;