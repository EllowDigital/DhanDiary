import 'react-native-get-random-values';
import React from 'react';
import Constants from 'expo-constants';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SplashScreen from './src/screens/SplashScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import AuthScreen from './src/screens/AuthScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';
import TermsScreen from './src/screens/TermsScreen';
import EulaScreen from './src/screens/EulaScreen';
import DrawerNavigator from './src/navigation/DrawerNavigator';
import { ToastProvider } from './src/context/ToastContext';
import { RootStackParamList, AuthStackParamList } from './src/types/navigation';
import { configureGoogleSignIn } from './src/services/googleAuth';
import { enableLegacyLayoutAnimations } from './src/utils/layoutAnimation';
import GoogleAuth from '@firebase-auth';

enableLegacyLayoutAnimations();

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="Login" component={AuthScreen} />
    <AuthStack.Screen name="Terms" component={TermsScreen} />
    <AuthStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    <AuthStack.Screen name="Eula" component={EulaScreen} />
  </AuthStack.Navigator>
);

const AppContent = () => (
  <NavigationContainer>
    <RootStack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Splash" component={SplashScreen} />
      <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
      <RootStack.Screen name="Auth" component={AuthNavigator} />
      <RootStack.Screen name="Main" component={DrawerNavigator} />
    </RootStack.Navigator>
  </NavigationContainer>
);


export default function App() {
  const [queryClient] = React.useState(() => new QueryClient());

  React.useEffect(() => {
    try {
      configureGoogleSignIn();
    } catch (err) {
      // non-fatal; log for diagnostics
      // Google sign-in configuration may fail in environments without native libs
      // This is expected in Expo Go; it's safe to continue.
      console.warn('configureGoogleSignIn failed', err);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
