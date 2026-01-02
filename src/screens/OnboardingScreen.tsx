import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Animated,
  FlatList,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// --- CUSTOM IMPORTS ---
import { colors } from '../utils/design';
import { markOnboardingComplete } from '../utils/onboarding';

// --- CONFIGURATION ---
const SLIDES = [
  {
    key: 'track',
    title: 'Track Every Rupee',
    description:
      'Capture daily income & expenses with structured categories. Know exactly where your money goes.',
    icon: 'account-balance-wallet',
    accent: '#2563EB', // Blue
  },
  {
    key: 'analytics',
    title: 'Smart Analytics',
    description: 'Visual graphs and monthly summaries help you spot spending habits and save more.',
    icon: 'bar-chart',
    accent: '#F59E0B', // Amber
  },
  {
    key: 'sync',
    title: 'Offline & Cloud Sync',
    description:
      'No internet? No problem. Log now, sync later. Your data is safe across all your Android devices.',
    icon: 'cloud-sync',
    accent: '#0891B2', // Cyan
  },
  {
    key: 'export',
    title: 'Export Reports',
    description:
      'Generate PDF or Excel reports of your ledger for tax filing or personal archiving.',
    icon: 'picture-as-pdf',
    accent: '#E11D48', // Rose
  },
  {
    key: 'privacy',
    title: 'Secure by Design',
    description:
      'Your financial data is encrypted and private. Secured by local encryption and granular privacy controls.',
    icon: 'lock',
    accent: '#059669', // Emerald
  },
];

// --- COMPONENT: ONBOARDING ITEM (Individual Slide) ---
const OnboardingItem = ({
  item,
  index,
  scrollX,
}: {
  item: (typeof SLIDES)[0];
  index: number;
  scrollX: Animated.Value;
}) => {
  const { width, height } = useWindowDimensions();

  // Responsive sizing logic
  const isSmallScreen = width < 380 || height < 700;
  const isTablet = width > 700;

  // Circle Sizing
  const circleSize = isTablet ? 360 : isSmallScreen ? 220 : 280;
  const iconSize = isTablet ? 80 : isSmallScreen ? 48 : 56;

  // ANIMATION: Input Range based on current scroll position
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  // 1. Image Scale Animation (Bounces slightly)
  const imageScale = scrollX.interpolate({
    inputRange,
    outputRange: [0.6, 1, 0.6],
    extrapolate: 'clamp',
  });

  // 2. Text Opacity (Fades out when scrolling)
  const textOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

  // 3. Text Translate (Moves slightly to the side for parallax effect)
  const textTranslate = scrollX.interpolate({
    inputRange,
    outputRange: [50, 0, -50],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.slideContainer, { width }]}>
      {/* Animated Image Section */}
      <View style={[styles.imageContainer, { flex: isTablet ? 0.5 : 0.6 }]}>
        <Animated.View
          style={[
            styles.circleBackground,
            {
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              backgroundColor: `${item.accent}15`, // Very light opacity
              borderColor: `${item.accent}30`,
              transform: [{ scale: imageScale }],
            },
          ]}
        >
          <View
            style={[
              styles.iconBubble,
              {
                backgroundColor: item.accent,
                width: circleSize * 0.4,
                height: circleSize * 0.4,
                borderRadius: (circleSize * 0.4) / 2,
              },
            ]}
          >
            <MaterialIcon name={item.icon as any} size={iconSize} color="#fff" />
          </View>
        </Animated.View>
      </View>

      {/* Animated Text Section */}
      <View style={styles.textContainer}>
        <Animated.Text
          style={[
            styles.title,
            {
              fontSize: isSmallScreen ? 22 : 26,
              opacity: textOpacity,
              transform: [{ translateX: textTranslate }],
            },
          ]}
        >
          {item.title}
        </Animated.Text>
        <Animated.Text
          style={[
            styles.description,
            {
              fontSize: isSmallScreen ? 14 : 16,
              opacity: textOpacity,
              transform: [{ translateX: textTranslate }],
            },
          ]}
        >
          {item.description}
        </Animated.Text>
      </View>
    </View>
  );
};

// --- COMPONENT: PAGINATOR (Dots) ---
const Paginator = ({ data, scrollX }: { data: typeof SLIDES; scrollX: Animated.Value }) => {
  const { width } = useWindowDimensions();

  return (
    <View style={styles.dotsContainer}>
      {data.map((_, i) => {
        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];

        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [8, 24, 8], // Expands width when active
          extrapolate: 'clamp',
        });

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });

        return (
          <Animated.View key={i.toString()} style={[styles.dot, { width: dotWidth, opacity }]} />
        );
      })}
    </View>
  );
};

// --- MAIN SCREEN ---
const OnboardingScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList>(null);
  const [completing, setCompleting] = useState(false);

  // Optimizing FlatList updates with useMemo
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const completeOnboarding = async () => {
    if (completing) return;
    setCompleting(true);
    await markOnboardingComplete();
    // Use root reset to prevent going back to onboarding
    try {
      const { resetRoot } = await import('../utils/rootNavigation');
      resetRoot({ index: 0, routes: [{ name: 'Auth' }] });
    } catch (e) {
      navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
    }
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      completeOnboarding();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom'] as any}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background || '#F9FAFB'} />

      {/* Header: Skip Button */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={completeOnboarding}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Main Slides */}
      <View style={{ flex: 3 }}>
        <FlatList
          ref={listRef}
          data={SLIDES}
          renderItem={({ item, index }) => (
            <OnboardingItem item={item} index={index} scrollX={scrollX} />
          )}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: false,
          })}
          scrollEventThrottle={32}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewConfig}
        />
      </View>

      {/* Footer: Dots & Button */}
      <View
        style={[
          styles.footer,
          {
            // Keep CTA above gesture/navigation bar across Android devices
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 10) + 12,
          },
        ]}
      >
        <Paginator data={SLIDES} scrollX={scrollX} />

        <TouchableOpacity
          style={styles.button}
          onPress={handleNext}
          activeOpacity={0.8}
          disabled={completing}
        >
          <Text style={styles.buttonText}>
            {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
          {currentIndex !== SLIDES.length - 1 && (
            <MaterialIcon name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background || '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 10,
    height: 50,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 10,
  },
  skipText: {
    color: colors.muted || '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
  // Slide Styles
  slideContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  circleBackground: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  iconBubble: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10, // Android Shadow
  },
  textContainer: {
    flex: 0.4,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'flex-start', // Align text to top of container
  },
  title: {
    fontWeight: '800',
    color: colors.text || '#111827',
    textAlign: 'center',
    marginBottom: 16,
    includeFontPadding: false,
  },
  description: {
    color: colors.muted || '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  // Footer Styles
  footer: {
    flex: 1, // Takes up remaining space
    width: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    gap: 30, // Space between dots and button
  },
  dotsContainer: {
    flexDirection: 'row',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary || '#2563EB',
    marginHorizontal: 4,
  },
  button: {
    backgroundColor: colors.primary || '#2563EB',
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary || '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default OnboardingScreen;
