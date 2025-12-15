import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  Text,
  Platform,
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
import { colors as themeColors, spacing as themeSpacing } from '../utils/design';

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
};

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
}) => {
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const canGoBack = navigation.canGoBack();

  const [hintVisible, setHintVisible] = useState(showScrollHint);

  const handleNav = () => {
    const nav: any = navigation;
    if (canGoBack) return navigation.goBack();
    // Prefer opening the drawer so users can access navigation when available
    if (nav.openDrawer) return nav.openDrawer();
    if (nav.toggleDrawer) return nav.toggleDrawer();
  };

  const handleDismissHint = () => {
    setHintVisible(false);
    onDismissScrollHint?.();
  };

  useEffect(() => {
    setHintVisible(showScrollHint);
  }, [showScrollHint]);

  useEffect(() => {
    if (hintVisible && scrollOffset > scrollHintThreshold) {
      setHintVisible(false);
      onDismissScrollHint?.();
    }
  }, [scrollOffset, hintVisible, scrollHintThreshold]);

  // --- Animation: Lift on Scroll (No Borders) ---
  const headerAnimatedStyle = useAnimatedStyle(() => {
    const isScrolled = scrollOffset > 10;
    return {
      backgroundColor: themeColors.background,
      // Instead of a border, we fade in a soft shadow
      shadowOpacity: withTiming(isScrolled ? 0.05 : 0, { duration: 300 }),
      elevation: withTiming(isScrolled ? 4 : 0, { duration: 300 }),
    };
  });

  const topPadding = (useSafeAreaPadding ? insets.top : 0) + themeSpacing(1);

  return (
    <Animated.View
      style={[styles.wrapper, { paddingTop: topPadding }, headerAnimatedStyle, style]}
      accessibilityRole="header"
    >
      <View style={styles.row}>
        {/* Left Action */}
        {!hideLeftAction ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleNav}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {canGoBack ? (
              <MaterialIcons name="arrow-back" size={20} color={themeColors.text} />
            ) : (
              <MaterialIcons name="menu" size={20} color={themeColors.text} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.iconPlaceholder} />
        )}

        {/* Title (optionally with app icon) */}
        <View style={[styles.titleWrap, showAppIcon ? styles.titleWithIcon : undefined]}>
          {showAppIcon && (
            <View style={styles.appIconWrap}>
              {(() => {
                try {
                  if (typeof require !== 'function') return null;
                  const src = require('../../assets/splash-icon.png');
                  return (
                    <Animated.Image
                      source={src}
                      style={styles.appIcon}
                      resizeMode="cover"
                    />
                  );
                } catch (e) {
                  return null;
                }
              })()}
            </View>
          )}
          <View style={styles.titleTexts}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        {/* Right Slot */}
        <View style={styles.rightContainer}>{rightSlot || <View style={{ width: 40 }} />}</View>
      </View>

      {/* Scroll Hint (Floating Pill) */}
      {hintVisible && (
        <Animated.View
          entering={FadeInUp.duration(400).springify()}
          exiting={FadeOutUp.duration(300)}
          style={styles.hintContainer}
        >
          <TouchableOpacity onPress={handleDismissHint} style={styles.hintPill} activeOpacity={0.8}>
            <MaterialIcons name="keyboard-arrow-down" size={16} color={themeColors.primary} />
            <Text style={styles.hintText}>Scroll for more</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: themeSpacing(2),
    paddingBottom: themeSpacing(1.5),
    zIndex: 10,
    // Default Shadow Config (hidden by opacity in animation)
    shadowColor: themeColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14, // Slightly rounder squircle
    backgroundColor: themeColors.card, // Soft light gray background
    justifyContent: 'center',
    alignItems: 'center',
    // No border here
  },
  titleWrap: {
    flex: 1,
    paddingHorizontal: themeSpacing(1.5),
    justifyContent: 'center',
  },
  iconPlaceholder: { width: 42, height: 42 },
  titleWithIcon: { flexDirection: 'row', alignItems: 'center' },
  titleTexts: { flex: 1 },
  appIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: themeColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: themeSpacing(1.5),
    shadowColor: themeColors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  appIcon: { width: 34, height: 34, borderRadius: 8 },
  title: {
    fontSize: 20, // Slightly larger
    fontWeight: '800', // Bold modern font
    color: themeColors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 2,
    color: themeColors.subtleText,
    fontSize: 13,
    fontWeight: '500',
  },
  rightContainer: {
    minWidth: 42,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  // --- Hint Styles ---
  hintContainer: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: -1,
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.background,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 30, // Full capsule

    // Soft Floating Shadow (Instead of border)
    shadowColor: themeColors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  hintText: {
    fontSize: 11,
    color: themeColors.subtleText,
    fontWeight: '700',
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default ScreenHeader;
