import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  StatusBar,
  TouchableOpacity,
  Animated,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { Button } from '@rneui/themed';

import { RootStackParamList } from '../types/navigation';
import { colors } from '../utils/design';
import { markOnboardingComplete } from '../utils/onboarding';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'track',
    title: 'Track income & expenses',
    description: 'Capture every rupee with structured categories, notes, and instant summaries.',
    icon: 'timeline',
    accent: '#2563EB',
    gradient: ['#EEF2FF', '#FFFFFF'],
  },
  {
    key: 'sync',
    title: 'Offline first, cloud ready',
    description: 'Log expenses without internet. Automatically sync when you are back online.',
    icon: 'cloud-sync',
    accent: '#0891B2',
    gradient: ['#ECFEFF', '#FFFFFF'],
  },
  {
    key: 'devices',
    title: 'Use it on every device',
    description: 'Your ledger travels with you. Seamless experience on phones and tablets.',
    icon: 'devices-other',
    accent: '#7C3AED',
    gradient: ['#F5F3FF', '#FFFFFF'],
  },
  {
    key: 'privacy',
    title: 'Secure & private by design',
    description:
      'Bank-grade encryption, granular controls, and Firebase Auth keep your data protected.',
    icon: 'verified-user',
    accent: '#059669',
    gradient: ['#ECFDF5', '#FFFFFF'],
  },
];

const DOT_SIZE = 8;

const OnboardingScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Onboarding'>>();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<any>>(null);
  const [completing, setCompleting] = useState(false);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems?.length) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }).current;

  const viewabilityConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 60 }),
    []
  );

  const completeOnboarding = async () => {
    if (completing) return;
    setCompleting(true);
    await markOnboardingComplete();
    navigation.replace('Auth');
  };

  const handleNext = () => {
    if (currentIndex === SLIDES.length - 1) {
      completeOnboarding();
      return;
    }
    listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
  };

  const renderSlide = ({ item }: { item: (typeof SLIDES)[number] }) => (
    <View style={[styles.slide, { width }]}
    >
      <View style={[styles.illustration, { backgroundColor: `${item.accent}12`, borderColor: `${item.accent}30` }]}> 
        <View style={[styles.iconBubble, { backgroundColor: item.accent }]}
        >
          <MaterialIcon name={item.icon as any} size={44} color="#fff" />
        </View>
      </View>
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideDescription}>{item.description}</Text>
    </View>
  );

  const renderDots = () => (
    <View style={styles.dotsRow}>
      {SLIDES.map((_, index) => {
        const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
        const dotWidth = scrollX.interpolate({
          inputRange,
          outputRange: [DOT_SIZE, DOT_SIZE * 2, DOT_SIZE],
          extrapolate: 'clamp',
        });
        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.4, 1, 0.4],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={`dot-${index}`}
            style={[styles.dot, { width: dotWidth, opacity }]}
          />
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={completeOnboarding}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {renderDots()}

      <View style={styles.ctaContainer}>
        <Button
          title={currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          onPress={handleNext}
          loading={completing}
          buttonStyle={styles.primaryBtn}
          titleStyle={styles.primaryText}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  slide: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  illustration: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    borderWidth: 1,
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  slideDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  dot: {
    height: DOT_SIZE,
    borderRadius: DOT_SIZE,
    backgroundColor: colors.primary,
    marginHorizontal: 4,
  },
  ctaContainer: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 24,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default OnboardingScreen;
