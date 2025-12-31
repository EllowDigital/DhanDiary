import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  Text,
  Image,
} from 'react-native';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { colors as themeColors } from '../utils/design';
import { subscribeBanner } from '../utils/bannerState';

// --- TYPES ---
export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  showScrollHint?: boolean;
  scrollOffset?: number;
  scrollHintThreshold?: number;
  onDismissScrollHint?: () => void;
  style?: StyleProp<ViewStyle>;
  useSafeAreaPadding?: boolean;
  showAppIcon?: boolean;
  hideLeftAction?: boolean;
  backAction?: () => void; // Optional override
};

// --- COMPONENT ---
const ScreenHeader: React.FC<ScreenHeaderProps> = ({
  title,
  subtitle,
  rightSlot,
  showScrollHint = false,
  scrollOffset = 0,
  scrollHintThreshold = 50,
  onDismissScrollHint,
  style,
  useSafeAreaPadding = true,
  showAppIcon = false,
  hideLeftAction = false,
  backAction,
}) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();

  // Determine navigation state safely
  const canGoBack = navigation.canGoBack?.() ?? false;

  const [hintVisible, setHintVisible] = useState(showScrollHint);

  // --- HANDLERS ---
  const handleNav = () => {
    if (backAction) return backAction();
    if (canGoBack) return navigation.goBack();

    // Drawer fallback logic
    const nav: any = navigation;
    if (nav.openDrawer) return nav.openDrawer();
    if (nav.toggleDrawer) return nav.toggleDrawer();
  };

  const handleDismissHint = () => {
    setHintVisible(false);
    onDismissScrollHint?.();
  };

  // Sync prop changes
  useEffect(() => {
    setHintVisible(showScrollHint);
  }, [showScrollHint]);

  // Auto-dismiss on scroll
  useEffect(() => {
    if (hintVisible && scrollOffset > scrollHintThreshold) {
      handleDismissHint();
    }
  }, [scrollOffset, hintVisible, scrollHintThreshold]);

  // --- ANIMATIONS ---
  // Lift effect on scroll: Background opacity + Shadow ONLY (No Border Line)
  const headerAnimatedStyle = useAnimatedStyle(() => {
    const isScrolled = scrollOffset > 10;

    return {
      backgroundColor: themeColors.background || '#F8FAFC',
      // Removed borderBottomWidth/Color to fix the "black line" issue
      // Elevation / Shadow only appears when scrolled for depth
      shadowOpacity: withTiming(isScrolled ? 0.08 : 0, { duration: 300 }),
      elevation: withTiming(isScrolled ? 4 : 0, { duration: 300 }),
      // Optional: Add a very subtle border radius at bottom when scrolled if you want a "floating" feel
      // borderBottomLeftRadius: withTiming(isScrolled ? 16 : 0, { duration: 300 }),
      // borderBottomRightRadius: withTiming(isScrolled ? 16 : 0, { duration: 300 }),
    };
  });

  const topPadding = (useSafeAreaPadding ? insets.top : 0) + 12; // Base padding

  // If a global banner is visible we should not add the safe-area top padding
  // here (the banner already includes the safe area). Subscribe to banner visibility.
  const [bannerVisible, setBannerVisible] = React.useState(false);

  useEffect(() => {
    const unsub = subscribeBanner((v) => setBannerVisible(v));
    return () => unsub();
  }, []);

  const effectiveTopPadding = bannerVisible && useSafeAreaPadding ? 12 : topPadding;

  return (
    <Animated.View
      style={[styles.wrapper, { paddingTop: effectiveTopPadding }, headerAnimatedStyle, style]}
      accessibilityRole="header"
    >
      <View style={styles.contentRow}>
        {/* LEFT ACTION AREA */}
        <View style={styles.leftContainer}>
          {!hideLeftAction ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleNav}
              activeOpacity={0.6}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={canGoBack ? 'Go Back' : 'Open Menu'}
              accessibilityRole="button"
            >
              <MaterialIcons
                name={canGoBack ? 'arrow-back' : 'menu'}
                size={22}
                color={themeColors.text}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconPlaceholder} /> // Spacer
          )}
        </View>

        {/* TITLE AREA */}
        <View style={styles.titleContainer}>
          <View style={styles.titleRow}>
            {showAppIcon && (
              <View style={styles.appIconContainer}>
                {/* Safe require for asset */}
                <Image
                  source={require('../../assets/splash-icon.png')}
                  style={styles.appIcon}
                  resizeMode="contain"
                />
              </View>
            )}

            <View style={styles.textStack}>
              <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* RIGHT ACTION AREA */}
        <View style={styles.rightContainer}>
          {rightSlot || <View style={styles.iconPlaceholder} />}
        </View>
      </View>

      {/* SCROLL HINT (Floating Pill) */}
      {hintVisible && (
        <Animated.View
          entering={FadeInUp.duration(500).springify().damping(12)}
          exiting={FadeOutUp.duration(300)}
          style={styles.hintWrapper}
          pointerEvents="box-none"
        >
          <TouchableOpacity onPress={handleDismissHint} style={styles.hintPill} activeOpacity={0.9}>
            <MaterialIcons name="keyboard-arrow-down" size={16} color={themeColors.primary} />
            <Text style={styles.hintText}>Scroll for more</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 100, // Ensure header sits above scroll content
    elevation: 16,
    // Default shadow props (controlled by animated style)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    backgroundColor: themeColors.background,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44, // Standard touch target height
  },

  // Left Area
  leftContainer: {
    minWidth: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12, // Modern squircle-ish
    backgroundColor: themeColors.card || '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)', // Subtle border
  },
  iconPlaceholder: {
    width: 40,
    height: 40,
  },

  // Title Area
  titleContainer: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Center align title if desired, remove if left-align preferred
  },
  textStack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center', // Center align text stack
  },
  appIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginRight: 8,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  appIcon: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: themeColors.text || '#1E293B',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: themeColors.subtleText || '#64748B',
    marginTop: 1,
    textAlign: 'center',
  },

  // Right Area
  rightContainer: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  // Hint Pill
  hintWrapper: {
    position: 'absolute',
    bottom: -24, // Hang off the bottom edge
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: -1, // Behind main header interaction layer
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.card || '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,

    // Float Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,

    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  hintText: {
    fontSize: 11,
    fontWeight: '700',
    color: themeColors.subtleText || '#94A3B8',
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default ScreenHeader;
