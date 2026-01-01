import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Pressable,
    StatusBar,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';

import { colors, shadows } from '../utils/design';
import { CURRENT_ANNOUNCEMENT } from '../announcements/announcementConfig';
import {
    markCurrentAnnouncementSeen,
    shouldShowCurrentAnnouncement,
} from '../announcements/announcementState';

const ENTRY_MS = 360;
const EXIT_MS = 220;

const AnnouncementScreen = () => {
    const navigation = useNavigation<any>();
    const insets = useSafeAreaInsets();

    const [readyToShow, setReadyToShow] = useState(false);
    const [isDismissing, setIsDismissing] = useState(false);

    const opacity = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0.98)).current;

    const autoHideMs = useMemo(() => {
        const v = CURRENT_ANNOUNCEMENT.autoHideMs;
        return typeof v === 'number' && v > 0 ? v : null;
    }, []);

    const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const goToMain = () => {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    };

    const dismiss = async () => {
        if (isDismissing) return;
        setIsDismissing(true);

        if (autoHideTimer.current) {
            clearTimeout(autoHideTimer.current);
            autoHideTimer.current = null;
        }

        Animated.timing(opacity, {
            toValue: 0,
            duration: EXIT_MS,
            useNativeDriver: true,
        }).start(async () => {
            await markCurrentAnnouncementSeen();
            goToMain();
        });
    };

    useEffect(() => {
        let mounted = true;

        (async () => {
            const shouldShow = await shouldShowCurrentAnnouncement();
            if (!mounted) return;

            if (!shouldShow) {
                goToMain();
                return;
            }

            setReadyToShow(true);

            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 1,
                    duration: ENTRY_MS,
                    useNativeDriver: true,
                }),
                Animated.timing(scale, {
                    toValue: 1,
                    duration: ENTRY_MS,
                    useNativeDriver: true,
                }),
            ]).start();

            if (autoHideMs) {
                // Start auto-hide after the entry animation completes.
                autoHideTimer.current = setTimeout(() => {
                    dismiss();
                }, ENTRY_MS + autoHideMs);
            }
        })();

        return () => {
            mounted = false;
            if (autoHideTimer.current) {
                clearTimeout(autoHideTimer.current);
                autoHideTimer.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!readyToShow) return null;

    return (
        <View style={styles.root}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            <Animated.View
                style={[
                    styles.card,
                    {
                        paddingTop: Math.max(insets.top, 16) + 18,
                        paddingBottom: Math.max(insets.bottom, 16) + 18,
                        opacity,
                        transform: [{ scale }],
                    },
                ]}
            >
                <View style={styles.headerRow}>
                    <View
                        style={[
                            styles.iconBadge,
                            { backgroundColor: (CURRENT_ANNOUNCEMENT.accentColor || colors.primary) + '15' },
                        ]}
                    >
                        <MaterialIcon
                            name="celebration"
                            size={22}
                            color={CURRENT_ANNOUNCEMENT.accentColor || colors.primary}
                        />
                    </View>

                    <Text style={styles.title} numberOfLines={2}>
                        {CURRENT_ANNOUNCEMENT.title}{' '}
                        {CURRENT_ANNOUNCEMENT.emoji ? CURRENT_ANNOUNCEMENT.emoji : ''}
                    </Text>
                </View>

                <Text style={styles.message}>{CURRENT_ANNOUNCEMENT.message}</Text>

                <Pressable
                    onPress={dismiss}
                    accessibilityRole="button"
                    disabled={isDismissing}
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                >
                    <Text style={styles.buttonText}>Got it</Text>
                </Pressable>

                {autoHideMs ? (
                    <Text style={styles.hintText}>Auto-closes in a few seconds</Text>
                ) : null}
            </Animated.View>

            {/* Backdrop */}
            <View style={styles.backdrop} />
        </View>
    );
};

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.04)',
    },
    card: {
        width: '92%',
        maxWidth: 520,
        borderRadius: 18,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 18,
        zIndex: 2,
        ...shadows.small,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    iconBadge: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    title: {
        flex: 1,
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    message: {
        fontSize: 14,
        lineHeight: 20,
        color: colors.muted,
        marginBottom: 18,
    },
    button: {
        height: 46,
        borderRadius: 14,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPressed: {
        opacity: Platform.OS === 'ios' ? 0.7 : 0.85,
    },
    buttonText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 14,
    },
    hintText: {
        marginTop: 10,
        fontSize: 12,
        color: colors.muted,
        textAlign: 'center',
    },
});

export default AnnouncementScreen;
