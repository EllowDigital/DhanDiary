import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    Animated,
    Dimensions,
    StatusBar,
    Easing,
} from 'react-native';

const COLORS = {
    primary: '#4F46E5', // Indigo/Blue
    background: '#ffffff',
    text: '#1F2937',
    muted: '#9CA3AF',
    white: '#ffffff',
};

const { width } = Dimensions.get('window');

const SplashScreen = ({ navigation }: any) => {
    // 2. Animation Values
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const slideAnim = useRef(new Animated.Value(50)).current;

    useEffect(() => {
        // Start Animation
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
                easing: Easing.out(Easing.quad),
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                friction: 7,
                tension: 40,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 1000,
                useNativeDriver: true,
                easing: Easing.out(Easing.back(1.5)),
            }),
        ]).start();

        // 3. Navigate after delay (Replaces Firebase logic)
        const timer = setTimeout(() => {
            // Replace 'Login' with your actual screen name
            if (navigation) {
                navigation.replace('Login');
            } else {
                console.log('Navigation not ready or mocked');
            }
        }, 3000); // 3 seconds splash time

        return () => clearTimeout(timer);
    }, []);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

            {/* Main Content */}
            <View style={styles.centerContent}>
                {/* LOGO */}
                <Animated.View
                    style={[
                        styles.logoWrapper,
                        {
                            opacity: fadeAnim,
                            transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
                        },
                    ]}
                >
                    {/* Make sure this path is correct in your project */}
                    <Image
                        source={require('../../assets/splash-icon.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </Animated.View>

                {/* APP NAME */}
                <Animated.View
                    style={{
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }],
                        alignItems: 'center',
                    }}
                >
                    <Text style={styles.appName}>DhanDiary</Text>
                    <Text style={styles.tagline}>Intelligent Finance Tracker</Text>
                </Animated.View>
            </View>

            {/* FOOTER */}
            <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
                <Text style={styles.powered}>
                    Powered by <Text style={styles.brand}>EllowDigital</Text>
                </Text>
            </Animated.View>
        </View>
    );
};

export default SplashScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerContent: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        paddingHorizontal: 20,
    },
    /* LOGO STYLES */
    logoWrapper: {
        width: 150,
        height: 150,
        marginBottom: 30,
        backgroundColor: COLORS.white,
        borderRadius: 35,
        // Shadow for iOS
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        // Elevation for Android
        elevation: 10,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    logo: {
        width: '100%',
        height: '100%',
    },
    /* TEXT STYLES */
    appName: {
        fontSize: 32,
        fontWeight: '800',
        color: COLORS.text,
        textAlign: 'center',
        letterSpacing: -1,
    },
    tagline: {
        fontSize: 16,
        color: COLORS.muted,
        marginTop: 8,
        textAlign: 'center',
        fontWeight: '500',
    },
    /* FOOTER STYLES */
    footer: {
        position: 'absolute',
        bottom: 40,
        alignItems: 'center',
    },
    powered: {
        fontSize: 12,
        color: COLORS.muted,
    },
    brand: {
        fontWeight: '700',
        color: COLORS.text,
    },
});