import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Text,
  Platform,
  Animated,
  KeyboardAvoidingView,
  StatusBar,
  Keyboard,
  LayoutAnimation,
  UIManager,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribeBanner, isBannerVisible } from '../utils/bannerState';
import { Input, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useUser } from '@clerk/clerk-expo';
import { getSession } from '../db/session';
import { subscribeSession } from '../utils/sessionEvents';
import { useNavigation } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

// --- CUSTOM HOOKS & SERVICES (Assumed paths) ---
import { useToast } from '../context/ToastContext';
import { colors } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';
import { deleteAccount } from '../services/auth';
import UserAvatar from '../components/UserAvatar';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- TYPES ---
interface CardItem {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof MaterialIcon.glyphMap;
  bgColor: string;
  iconColor: string;
}

// --- SUB-COMPONENT: CUSTOM INPUT ---
const CustomInput = ({ containerStyle, ...props }: any) => (
  <Input
    {...props}
    autoCapitalize="none"
    containerStyle={[styles.inputContainer, containerStyle]}
    inputContainerStyle={styles.inputField}
    inputStyle={styles.inputText}
    labelStyle={styles.inputLabel}
    placeholderTextColor={colors.muted || '#94A3B8'}
    selectionColor={colors.primary}
    renderErrorMessage={false}
  />
);

// --- SUB-COMPONENT: EXPANDABLE CARD ---
const ExpandableCard = ({
  item,
  isExpanded,
  onToggle,
  children,
}: {
  item: CardItem;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => {
  // We use Animated for the arrow rotation, but LayoutAnimation for height (smoother)
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [isExpanded]);

  const arrowRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View
      style={[
        styles.card,
        isExpanded && styles.cardExpanded,
        item.id === 'delete' && styles.cardDanger,
      ]}
    >
      <TouchableOpacity activeOpacity={0.7} style={styles.cardHeader} onPress={onToggle}>
        <View style={[styles.iconBox, { backgroundColor: item.bgColor }]}>
          <MaterialIcon name={item.icon} size={22} color={item.iconColor} />
        </View>
        <View style={styles.headerTextContainer}>
          <Text
            style={[
              styles.cardTitle,
              item.id === 'delete' && { color: (colors as any).accentRed || '#EF4444' },
            ]}
          >
            {item.title}
          </Text>
          <Text style={styles.cardDesc}>{item.description}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: arrowRotation }] }}>
          <MaterialIcon name="keyboard-arrow-down" size={24} color={colors.muted || '#64748B'} />
        </Animated.View>
      </TouchableOpacity>

      {isExpanded && <View style={styles.cardBody}>{children}</View>}
    </View>
  );
};

// --- MAIN SCREEN ---
const AccountManagementScreen = () => {
  const { user, isLoaded } = useUser();
  const [fallbackSession, setFallbackSession] = useState<any>(null);
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  const [bannerVisible, setBannerVisible] = useState<boolean>(isBannerVisible());

  // State
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [isLoadingBiometrics, setIsLoadingBiometrics] = useState(true);

  // Password Form State
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Biometric State
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [hasBiometricHardware, setHasBiometricHardware] = useState(false);
  const [biometricType, setBiometricType] = useState<string>('Biometrics');

  // Loaders
  const [savingPasswordState, setSavingPasswordState] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Animation for Entrance
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Has Password check (Clerk specific)
  const hasPassword = user?.passwordEnabled;

  useEffect(() => {
    // Entrance Animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    checkBiometrics();
  }, []);

  // subscribe to banner visibility so this screen doesn't add top safe-area twice
  useEffect(() => {
    const unsub = subscribeBanner((v) => setBannerVisible(!!v));
    return () => {
      if (unsub) unsub();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const s = await getSession();
        if (mounted) setFallbackSession(s);
      } catch (e) { }
    };
    load();
    const unsub = subscribeSession((s) => {
      if (mounted) setFallbackSession(s);
    });
    return () => {
      mounted = false;
      try {
        unsub();
      } catch (e) { }
    };
  }, []);

  const checkBiometrics = async () => {
    try {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      setHasBiometricHardware(hasHw && isEnrolled);

      if (hasHw && isEnrolled) {
        // Determine type (FaceID vs TouchID) for better UI text
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Fingerprint');
        }

        const enabled = await SecureStore.getItemAsync('BIOMETRIC_ENABLED');
        setBiometricsEnabled(enabled === 'true');
      }
    } catch (e) {
      console.log('Biometric check error', e);
    } finally {
      setIsLoadingBiometrics(false);
    }
  };

  const toggleBiometrics = async (val: boolean) => {
    try {
      if (val) {
        // If turning ON, verify identity first
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: `Enable ${biometricType}`,
          fallbackLabel: 'Use Passcode',
        });
        if (!result.success) return;
      }

      setBiometricsEnabled(val);
      if (val) {
        await SecureStore.setItemAsync('BIOMETRIC_ENABLED', 'true');
        showToast(`${biometricType} Enabled`);
      } else {
        await SecureStore.deleteItemAsync('BIOMETRIC_ENABLED');
        showToast(`${biometricType} Disabled`);
      }
    } catch (e) {
      showToast('Failed to update security settings', 'error');
    }
  };

  const toggleCard = (id: string) => {
    // Configure LayoutAnimation for smooth expand/collapse
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveCard((prev) => (prev === id ? null : id));
    if (activeCard !== id) Keyboard.dismiss();
  };

  const handlePasswordSave = useCallback(async () => {
    if (!newPass || !confirmPass)
      return Alert.alert('Missing Fields', 'Please fill in the new password fields.');
    if (newPass !== confirmPass) return Alert.alert('Mismatch', 'New passwords do not match');
    if (newPass.length < 8) return Alert.alert('Weak Password', 'Minimum 8 characters required');
    if (hasPassword && !curPass)
      return Alert.alert('Missing Field', 'Current password is required.');

    if (!user) return;

    setSavingPasswordState(true);
    try {
      if (hasPassword) {
        await user.updatePassword({
          currentPassword: curPass,
          newPassword: newPass,
        });
        showToast('Password changed successfully');
      } else {
        await user.updatePassword({
          newPassword: newPass,
        });
        showToast('Password set successfully!');
      }

      // Reset form
      setCurPass('');
      setNewPass('');
      setConfirmPass('');
      toggleCard(''); // Close card
    } catch (err: any) {
      Alert.alert('Error', err.errors ? err.errors[0]?.message : err.message);
    } finally {
      setSavingPasswordState(false);
    }
  }, [curPass, newPass, confirmPass, hasPassword, user]);

  const handleDelete = useCallback(async () => {
    Alert.alert(
      'Delete Account?',
      'This action is irreversible. All your data will be permanently wiped.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setDeletingAccount(true);
            try {
              // Try to delete Clerk user, but don't block local cleanup if it fails.
              try {
                if (typeof (user as any).delete === 'function') {
                  await (user as any).delete();
                }
              } catch (clerkErr) {
                console.warn(
                  '[Account] Clerk user.delete() failed, continuing with local cleanup',
                  clerkErr
                );
              }

              // Ensure local cleanup runs even if Clerk deletion failed.
              console.info('[Account] deletion initiated', { userId: (user as any)?.id || null });
              let deletionResult: any = {};
              try {
                deletionResult = await deleteAccount();
              } catch (localErr) {
                console.warn('[Account] deleteAccount() failed', localErr);
              }
              console.info('[Account] deletion completed', deletionResult || {});

              // Re-initialize a fresh empty DB so the app resumes from a clean state
              try {
                const { initDB } = await import('../db/sqlite');
                if (typeof initDB === 'function') {
                  await initDB();
                }
              } catch (dbErr) {
                console.warn('[Account] initDB after delete failed', dbErr);
              }

              showToast('Account deleted');
              // Navigate to the Auth stack and open the AccountDeleted screen
              try {
                navigation.reset({ index: 0, routes: [{ name: 'Auth', params: { screen: 'AccountDeleted' } }] });
              } catch (navErr) {
                console.warn('[Account] navigation.reset failed', navErr);
              }
            } catch (err: any) {
              // Catch-all: surface message but still attempt to navigate to Auth so app isn't left in broken state
              console.warn('[Account] unexpected error during delete flow', err);
              try {
                navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
              } catch (navErr) { }
              Alert.alert('Error', err?.message || 'Failed to delete account');
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  }, [user]);

  if (!isLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView
        style={styles.safeArea}
        edges={bannerVisible ? ['left', 'right'] : ['top', 'left', 'right']}
      >
        <ScreenHeader
          title="Account"
          subtitle="Profile & Security"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View style={{ opacity: fadeAnim }}>
              {/* 1. HERO PROFILE ROW */}
              <View style={styles.heroRow}>
                <View style={styles.heroAvatar}>
                  {(() => {
                    const effectiveName =
                      (user &&
                        ((user as any).fullName ||
                          (user as any).firstName ||
                          (user as any).name)) ||
                      fallbackSession?.name ||
                      null;
                    const effectiveImage =
                      (user as any)?.imageUrl ||
                      (user as any)?.image ||
                      fallbackSession?.imageUrl ||
                      fallbackSession?.image;

                    return (
                      <View>
                        <UserAvatar
                          size={48}
                          name={effectiveName || undefined}
                          imageUrl={effectiveImage}
                        />
                        {fallbackSession && !user ? (
                          <View style={styles.localBadgeInline}>
                            <MaterialIcon name="cloud-off" size={12} color="#B91C1C" />
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}
                  {/* Verified Badge */}
                  {(user as any)?.emailAddresses?.some(
                    (e: any) => e.verification?.status === 'verified'
                  ) && (
                      <View style={styles.verifiedBadge}>
                        <MaterialIcon name="check" size={12} color="white" />
                      </View>
                    )}
                </View>

                <View style={styles.heroInfo}>
                  <Text style={styles.heroName}>
                    {(user as any)?.fullName ||
                      (user as any)?.name ||
                      fallbackSession?.name ||
                      'User'}
                  </Text>
                  <Text style={styles.heroEmail}>
                    {(user as any)?.primaryEmailAddress?.emailAddress ||
                      fallbackSession?.email ||
                      'No email linked'}
                  </Text>
                  <View style={styles.authMethodContainer}>
                    <MaterialIcon
                      name={hasPassword ? 'lock' : 'public'}
                      size={12}
                      color={colors.primary || '#3B82F6'}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.authMethodText}>
                      {hasPassword ? 'Password Secured' : 'Social Login'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 2. PASSWORD SECTION */}
              <ExpandableCard
                item={{
                  id: 'password',
                  title: hasPassword ? 'Change Password' : 'Set Password',
                  description: hasPassword
                    ? 'Update your login password'
                    : 'Secure account with a password',
                  icon: hasPassword ? 'lock-outline' : 'lock-open',
                  bgColor: '#FFF7ED', // Orange Tint
                  iconColor: '#EA580C',
                }}
                isExpanded={activeCard === 'password'}
                onToggle={() => toggleCard('password')}
              >
                {hasPassword && (
                  <CustomInput
                    label="Current Password"
                    placeholder="Enter current password"
                    secureTextEntry={!showCur}
                    value={curPass}
                    onChangeText={setCurPass}
                    rightIcon={
                      <MaterialIcon
                        name={showCur ? 'visibility' : 'visibility-off'}
                        size={20}
                        color={colors.muted || '#94A3B8'}
                        onPress={() => setShowCur(!showCur)}
                      />
                    }
                  />
                )}
                <CustomInput
                  label="New Password"
                  placeholder="Min 8 characters"
                  secureTextEntry={!showNew}
                  value={newPass}
                  onChangeText={setNewPass}
                  rightIcon={
                    <MaterialIcon
                      name={showNew ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={colors.muted || '#94A3B8'}
                      onPress={() => setShowNew(!showNew)}
                    />
                  }
                />
                <CustomInput
                  label="Confirm Password"
                  placeholder="Re-enter new password"
                  secureTextEntry={!showConfirm}
                  value={confirmPass}
                  onChangeText={setConfirmPass}
                  rightIcon={
                    <MaterialIcon
                      name={showConfirm ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={colors.muted || '#94A3B8'}
                      onPress={() => setShowConfirm(!showConfirm)}
                    />
                  }
                />
                <Button
                  title={hasPassword ? 'Update Password' : 'Set Password'}
                  loading={savingPasswordState}
                  onPress={handlePasswordSave}
                  buttonStyle={styles.primaryBtn}
                  titleStyle={styles.btnText}
                />
              </ExpandableCard>

              {/* 3. APP SECURITY (BIOMETRICS) */}
              {!isLoadingBiometrics && hasBiometricHardware && (
                <ExpandableCard
                  item={{
                    id: 'app_security',
                    title: 'App Security',
                    description: `Secure using ${biometricType}`,
                    icon: 'fingerprint',
                    bgColor: '#EFF6FF', // Blue Tint
                    iconColor: colors.primary || '#3B82F6',
                  }}
                  isExpanded={activeCard === 'app_security'}
                  onToggle={() => toggleCard('app_security')}
                >
                  <View style={styles.switchRow}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={styles.switchLabel}>Enable {biometricType}</Text>
                      <Text style={styles.switchDesc}>
                        Require {biometricType} authentication to open the app.
                      </Text>
                    </View>
                    <Switch
                      value={biometricsEnabled}
                      onValueChange={toggleBiometrics}
                      trackColor={{ false: '#E2E8F0', true: colors.primary || '#3B82F6' }}
                      thumbColor={'#fff'}
                    />
                  </View>
                </ExpandableCard>
              )}

              {/* 4. DELETE SECTION */}
              <ExpandableCard
                item={{
                  id: 'delete',
                  title: 'Delete Account',
                  description: 'Permanently remove all data',
                  icon: 'delete-outline',
                  bgColor: '#FEF2F2', // Red Tint
                  iconColor: '#EF4444',
                }}
                isExpanded={activeCard === 'delete'}
                onToggle={() => toggleCard('delete')}
              >
                <View style={styles.dangerZone}>
                  <View style={styles.dangerAlert}>
                    <MaterialIcon
                      name="warning"
                      size={20}
                      color="#991B1B"
                      style={{ marginBottom: 8 }}
                    />
                    <Text style={styles.dangerText}>
                      This action will permanently delete your account, transactions, and settings.
                      This cannot be undone.
                    </Text>
                  </View>
                  <Button
                    title="Delete Account Forever"
                    buttonStyle={styles.destructiveBtn}
                    onPress={handleDelete}
                    loading={deletingAccount}
                  />
                </View>
              </ExpandableCard>

              {/* Bottom Spacer */}
              <View style={{ height: 100 }} />
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

// --- STYLES ---
const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: colors.background || '#F8FAFC',
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10,
  },

  /* HERO ROW */
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    // Soft Shadow
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  heroAvatar: {
    position: 'relative',
    marginRight: 16,
  },
  localBadgeInline: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.12)',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.primary || '#3B82F6',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text || '#1E293B',
    marginBottom: 4,
  },
  heroEmail: {
    fontSize: 14,
    color: colors.muted || '#64748B',
    marginBottom: 8,
  },
  authMethodContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  authMethodText: {
    fontSize: 12,
    color: colors.primary || '#3B82F6',
    fontWeight: '600',
  },

  /* SECURITY TOGGLE */
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#1E293B',
    marginBottom: 4,
  },
  switchDesc: {
    fontSize: 13,
    color: colors.muted || '#64748B',
    lineHeight: 18,
  },

  /* CARDS */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    // Slight shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardExpanded: {
    borderColor: colors.primary || '#3B82F6',
    elevation: 2,
  },
  cardDanger: {
    borderColor: '#FECACA',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  headerTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text || '#1E293B',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    color: colors.muted || '#64748B',
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
  },

  /* INPUTS & BUTTONS */
  inputContainer: {
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  inputField: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputText: {
    fontSize: 15,
    color: colors.text || '#1E293B',
  },
  inputLabel: {
    fontSize: 13,
    color: colors.text || '#1E293B',
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
  },
  primaryBtn: {
    backgroundColor: colors.primary || '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
  },

  /* DANGER ZONE */
  dangerZone: {
    alignItems: 'center',
  },
  dangerAlert: {
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dangerText: {
    color: '#991B1B',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },
  destructiveBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 12,
    width: '100%',
  },
});

export default AccountManagementScreen;
