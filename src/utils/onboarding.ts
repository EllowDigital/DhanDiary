import AsyncStorage from './AsyncStorageWrapper';

const ONBOARDING_KEY = '@dhandiary:onboarding_completed_v1';

export const hasCompletedOnboarding = async () => {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY);
    return value === 'true';
  } catch (error) {
    return false;
  }
};

export const markOnboardingComplete = async () => {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  } catch (error) {
    // swallow – onboarding will reappear if we cannot persist
  }
};

export const resetOnboardingFlag = async () => {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
  } catch (error) {
    // ignore
  }
};

export const onboardingStorageKey = ONBOARDING_KEY;
