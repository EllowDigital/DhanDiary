import React, { useState } from 'react';
import { StyleSheet, View, Dimensions, Image, StatusBar } from 'react-native';
import { Text, Button } from '@rneui/themed';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../utils/design';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    title: 'Track Your Wealth',
    desc: 'Keep a daily log of you income and expenses effortlessly.',
    icon: 'wallet-outline',
    color: '#3B82F6',
  },
  {
    id: '2',
    title: 'Analyze Habits',
    desc: 'Visualize your spending patterns with beautiful charts and insights.',
    icon: 'chart-pie',
    color: '#8B5CF6',
  },
  {
    id: '3',
    title: 'Sync Securely',
    desc: 'Your data is encrypted and synced across your devices instantly.',
    icon: 'cloud-sync-outline',
    color: '#10B981',
  },
];

export const ONBOARDING_COMPLETE_KEY = 'ONBOARDING_COMPLETE';

const OnboardingScreen = () => {
  const navigation = useNavigation<any>();
  const [slideIndex, setSlideIndex] = useState(0);

  const handleNext = async () => {
    if (slideIndex < SLIDES.length - 1) {
      setSlideIndex(slideIndex + 1);
    } else {
      await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
      navigation.replace('Auth');
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    navigation.replace('Auth');
  };

  const currentSlide = SLIDES[slideIndex];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.pagination}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === slideIndex ? { backgroundColor: colors.primary, width: 24 } : { backgroundColor: '#E2E8F0' },
              ]}
            />
          ))}
        </View>
        <Button
          type="clear"
          title="Skip"
          onPress={handleSkip}
          titleStyle={{ color: '#94A3B8', fontSize: 14 }}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: currentSlide.color + '20' }]}>
          <MaterialCommunityIcons name={currentSlide.icon as any} size={80} color={currentSlide.color} />
        </View>

        <Text style={styles.title}>{currentSlide.title}</Text>
        <Text style={styles.desc}>{currentSlide.desc}</Text>
      </View>

      {/* Bottom Action */}
      <View style={styles.bottomBar}>
        <Button
          title={slideIndex === SLIDES.length - 1 ? "Get Started" : "Next"}
          onPress={handleNext}
          buttonStyle={styles.btn}
          containerStyle={styles.btnContainer}
          titleStyle={{ fontWeight: '700' }}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  pagination: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    height: 6,
    width: 6,
    borderRadius: 3,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 12,
    textAlign: 'center',
  },
  desc: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomBar: {
    padding: 20,
    paddingBottom: 30,
  },
  btn: {
    backgroundColor: colors.primary || '#2563EB',
    paddingVertical: 16,
    borderRadius: 16,
  },
  btnContainer: {
    width: '100%',
  },
});

export default OnboardingScreen;
