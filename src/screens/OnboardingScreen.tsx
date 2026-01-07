import React, { useRef, useState, useEffect, useMemo } from 'react';
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

  const isLandscape = width > height;
  const isSmallHeight = height < 600;

  // Dynamic Sizing
  const calculatedSize = isLandscape ? height * 0.45 : width * 0.7;
  const circleSize = Math.min(calculatedSize, 340);
  const iconSize = circleSize * 0.25;

  // ANIMATION: Input Range regenerates whenever 'width' changes
  // This ensures animations stay synced even after rotation
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  const imageScale = scrollX.interpolate({
    inputRange,
    outputRange: [0.6, 1, 0.6],
    extrapolate: 'clamp',
  });

  const textOpacity = scrollX.interpolate({
    inputRange,
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

  const textTranslate = scrollX.interpolate({
    inputRange,
    outputRange: [50, 0, -50],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.slideContainer, { width, flexDirection: isLandscape ? 'row' : 'column' }]}>
      {/* Animated Image Section */}
      <View style={[styles.imageContainer, { flex: isLandscape ? 0.5 : 0.6 }]}>
        <Animated.View
          style={[
            styles.circleBackground,
            {
              width: circleSize,
              height: circleSize,
              borderRadius: circleSize / 2,
              backgroundColor: `${item.accent}15`,
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
      <View
        style={[
          styles.textContainer,
          {
            flex: isLandscape ? 0.5 : 0.4,
            alignItems: isLandscape ? 'flex-start' : 'center',
            paddingHorizontal: isLandscape ? 20 : 32,
            justifyContent: isLandscape ? 'center' : 'flex-start',
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.title,
            {
              fontSize: isSmallHeight && isLandscape ? 20 : 26,
              textAlign: isLandscape ? 'left' : 'center',
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
              fontSize: isSmallHeight ? 14 : 16,
              textAlign: isLandscape ? 'left' : 'center',
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
          outputRange: [8, 24, 8],
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
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList>(null);
  const [completing, setCompleting] = useState(false);

  const isLandscape = width > height;

  // --- FIX: Handle Rotation / Orientation Change ---
  // When device rotates, the pixel offset of the FlatList becomes invalid.
  // We must immediately snap to the correct index based on the new width.
  useEffect(() => {
    if (listRef.current) {
      // We use a small timeout to allow the layout to settle slightly
      const timer = setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: currentIndex,
          animated: false, // Instant snap to prevent visual gliding
        });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [width]); // Re-run whenever width changes

  // --- OPTIMIZATION: GetItemLayout ---
  // This is crucial for rotation. It tells FlatList exactly where each item is
  // without having to render them first.
  const getItemLayout = (_: any, index: number) => ({
    length: width,
    offset: width * index,
    index,
  });

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

      <View style={styles.header}>
        <TouchableOpacity
          onPress={completeOnboarding}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
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
          // Pass getItemLayout to ensure accurate scrolling on rotation
          getItemLayout={getItemLayout}
          // Pass width as extraData so FlatList knows to re-render when orientation changes
          extraData={width}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: false,
          })}
          scrollEventThrottle={16} // Increased frequency for smoother animation
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewConfig}
        />
      </View>

      <View
        style={[
          styles.footer,
          {
            flexDirection: isLandscape ? 'row' : 'column',
            justifyContent: isLandscape ? 'space-between' : 'flex-end',
            alignItems: 'center',
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 10),
            paddingHorizontal: 24,
            paddingTop: isLandscape ? 10 : 0,
            gap: isLandscape ? 0 : 30,
            minHeight: isLandscape ? 60 : 120,
          },
        ]}
      >
        <Paginator data={SLIDES} scrollX={scrollX} />

        <TouchableOpacity
          style={[styles.button, { width: isLandscape ? 160 : '100%' }]}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background || '#F9FAFB',
  },
  header: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 10,
    height: 40,
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
  slideContainer: {
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
    elevation: 10,
  },
  textContainer: {},
  title: {
    fontWeight: '800',
    color: colors.text || '#111827',
    marginBottom: 12,
    includeFontPadding: false,
  },
  description: {
    color: colors.muted || '#6B7280',
    lineHeight: 24,
    paddingHorizontal: 4,
  },
  footer: {
    width: '100%',
    backgroundColor: 'transparent',
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
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default OnboardingScreen;
