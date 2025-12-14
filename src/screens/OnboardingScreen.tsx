import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Animated,
  FlatList,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Types and Utils (Mocked based on your context)
import { RootStackParamList } from '../types/navigation';
import { colors } from '../utils/design';
import { markOnboardingComplete } from '../utils/onboarding';

// --- CONFIGURATION ---
const SLIDES = [
  {
    key: 'track',
    title: 'Track Every Rupee',
    description: 'Capture daily income & expenses with structured categories. Know exactly where your money goes.',
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
    description: 'No internet? No problem. Log now, sync later. Your data is safe across all your Android devices.',
    icon: 'cloud-sync',
    accent: '#0891B2', // Cyan
  },
  {
    key: 'export',
    title: 'Export Reports',
    description: 'Generate PDF or Excel reports of your ledger for tax filing or personal archiving.',
    icon: 'picture-as-pdf',
    accent: '#E11D48', // Rose
  },
  {
    key: 'privacy',
    title: 'Secure by Design',
    description: 'Your financial data is encrypted and private. Secured by Firebase Auth and granular privacy controls.',
    icon: 'lock',
    accent: '#059669', // Emerald
  },
];

// --- COMPONENT: ONBOARDING ITEM (Individual Slide) ---
const OnboardingItem = ({ item, index, scrollX }: { item: typeof SLIDES[0], index: number, scrollX: Animated.Value }) => {
  const { width } = useWindowDimensions();
  
  // ANIMATION: Input Range based on current scroll position
  const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

  // 1. Image Scale Animation (Bounces slightly)
  const imageScale = scrollX.interpolate({
    inputRange,
    outputRange: [0.3, 1, 0.3],
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
      <View style={styles.imageContainer}>
        <Animated.View 
          style={[
            styles.circleBackground, 
            { 
              backgroundColor: `${item.accent}15`, // Very light opacity
              borderColor: `${item.accent}30`,
              transform: [{ scale: imageScale }] 
            }
          ]}
        >
          <View style={[styles.iconBubble, { backgroundColor: item.accent }]}>
            <MaterialIcon name={item.icon as any} size={56} color="#fff" />
          </View>
        </Animated.View>
      </View>

      {/* Animated Text Section */}
      <View style={styles.textContainer}>
        <Animated.Text 
          style={[
            styles.title, 
            { 
              opacity: textOpacity,
              transform: [{ translateX: textTranslate }]
            }
          ]}
        >
          {item.title}
        </Animated.Text>
        <Animated.Text 
          style={[
            styles.description, 
            { 
              opacity: textOpacity,
              transform: [{ translateX: textTranslate }]
            }
          ]}
        >
          {item.description}
        </Animated.Text>
      </View>
    </View>
  );
};

// --- COMPONENT: PAGINATOR (Dots) ---
const Paginator = ({ data, scrollX }: { data: typeof SLIDES, scrollX: Animated.Value }) => {
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
          <Animated.View
            key={i.toString()}
            style={[styles.dot, { width: dotWidth, opacity }]}
          />
        );
      })}
    </View>
  );
};

// --- MAIN SCREEN ---
const OnboardingScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Onboarding'>>();
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList>(null);
  const [completing, setCompleting] = useState(false);

  // Optimizing FlatList updates
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
    navigation.replace('Auth');
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      completeOnboarding();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Header: Skip Button */}
      <View style={styles.header}>
        <TouchableOpacity 
            onPress={completeOnboarding} 
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Main Slides */}
      <View style={{ flex: 3 }}>
        <FlatList
          ref={listRef}
          data={SLIDES}
          renderItem={({ item, index }) => <OnboardingItem item={item} index={index} scrollX={scrollX} />}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={32}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewConfig}
        />
      </View>

      {/* Footer: Dots & Button */}
      <View style={styles.footer}>
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
    backgroundColor: colors.background, // Ensure this exists in your utils/design
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
  },
  skipText: {
    color: colors.muted,
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
    flex: 0.6,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  circleBackground: {
    width: 280, // Responsive sizing handled by parent flex/justify
    height: 280,
    borderRadius: 140,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  iconBubble: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10, // Android Shadow
  },
  textContainer: {
    flex: 0.4,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
    includeFontPadding: false,
  },
  description: {
    fontSize: 16,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 10,
  },
  // Footer Styles
  footer: {
    flex: 1, // Takes up remaining space
    width: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'android' ? 40 : 20, // Extra padding for Android nav bars
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
    backgroundColor: colors.primary,
    marginHorizontal: 4,
  },
  button: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default OnboardingScreen;