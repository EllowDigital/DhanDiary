import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Dimensions,
    StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../utils/design';

const { width } = Dimensions.get('window');

const AccountDeletedScreen = () => {
    const navigation = useNavigation<any>();

    // Animation Values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;

    useEffect(() => {
        // Start entrance animation
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(slideAnim, {
                toValue: 0,
                friction: 8,
                tension: 40,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const handleCreateAccount = () => {
        // Reset stack to Auth -> Register to prevent going back
        navigation.reset({
            index: 1,
            routes: [{ name: 'Auth', params: { screen: 'Login' } }, { name: 'Auth', params: { screen: 'Register' } }],
        });
    };

    const handleSignIn = () => {
        // Reset stack to Auth -> Login
        navigation.reset({
            index: 0,
            routes: [{ name: 'Auth', params: { screen: 'Login' } }],
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            <Animated.View
                style={[
                    styles.content,
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
                ]}
            >
                {/* Visual Icon */}
                <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="heart-broken" size={64} color="#EF4444" />
                </View>

                {/* Text Content */}
                <Text style={styles.title}>So sad to see you go...</Text>
                <Text style={styles.subtitle}>
                    Your account and all local data have been permanently deleted. We hope to see you again someday.
                </Text>

                {/* Action Buttons */}
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleCreateAccount}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.primaryText}>Create New Account</Text>
                        <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.ghostButton}
                        onPress={handleSignIn}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.ghostText}>Sign In to Existing Account</Text>
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },

    /* Icon Styling */
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#FEF2F2', // Soft red background
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
        borderWidth: 1,
        borderColor: '#FEE2E2',
        // Soft shadow
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
    },

    /* Typography */
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1F2937',
        marginBottom: 12,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 48,
        lineHeight: 24,
    },

    /* Buttons */
    actions: {
        width: '100%',
        gap: 16,
    },
    primaryButton: {
        backgroundColor: colors.primary || '#2563EB',
        height: 56,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: colors.primary || '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    primaryText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        marginRight: 8,
    },
    ghostButton: {
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    ghostText: {
        color: '#374151',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default AccountDeletedScreen;