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
  Easing,
  KeyboardAvoidingView,
  StatusBar,
  Keyboard,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Logic Imports
import { updateProfileDetails, changePassword, deleteAccount } from '../services/auth';
import { retry } from '../utils/retry';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- SUB-COMPONENT: CUSTOM INPUT ---
const CustomInput = ({ containerStyle, ...props }: any) => (
  <Input
    {...props}
    containerStyle={[styles.inputContainer, containerStyle]}
    inputContainerStyle={styles.inputField}
    inputStyle={styles.inputText}
    labelStyle={styles.inputLabel}
    placeholderTextColor={colors.muted}
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
  index,
}: {
  item: any;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  index: number;
}) => {
  const animatedController = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedController, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
    }).start();
  }, [isExpanded]);

  const bodyHeight = animatedController.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 600], // Increased max height to accommodate content
  });

  const arrowRotation = animatedController.interpolate({
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
          <Text style={[styles.cardTitle, item.id === 'delete' && { color: colors.accentRed }]}>
            {item.title}
          </Text>
          <Text style={styles.cardDesc}>{item.description}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: arrowRotation }] }}>
          <MaterialIcon name="keyboard-arrow-down" size={24} color={colors.muted} />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View
        style={{ maxHeight: bodyHeight, overflow: 'hidden', opacity: animatedController }}
      >
        <View style={styles.cardBody}>{children}</View>
      </Animated.View>
    </View>
  );
};

const AccountManagementScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const [activeCard, setActiveCard] = useState<string | null>(null);

  // --- FORM STATE ---
  const [username, setUsername] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');

  // Password State
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Loaders
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPasswordState, setSavingPasswordState] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Animation for Entrance
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const toggleCard = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveCard((prev) => (prev === id ? null : id));
    if (activeCard !== id) Keyboard.dismiss();
  };

  // --- HANDLERS ---
  const handleSaveUsername = useCallback(async () => {
    if (!username.trim()) return Alert.alert('Validation', 'Name cannot be empty');
    setSavingUsername(true);
    try {
      await retry(() => updateProfileDetails({ name: username }), 3, 250);
      showToast('Name updated successfully');
      toggleCard('');
    } catch (err: any) {
      Alert.alert('Error', err?.message);
    } finally {
      setSavingUsername(false);
    }
  }, [username]);

  const handleSaveEmail = useCallback(async () => {
    setSavingEmail(true);
    try {
      await retry(() => updateProfileDetails({ email }), 3, 250);
      showToast('Email updated successfully');
      toggleCard('');
    } catch (err: any) {
      Alert.alert('Error', err?.message);
    } finally {
      setSavingEmail(false);
    }
  }, [email, user]);

  const handlePasswordSave = useCallback(async () => {
    if (!curPass || !newPass || !confirmPass)
      return Alert.alert('Missing Fields', 'All fields required');
    if (newPass !== confirmPass) return Alert.alert('Mismatch', 'New passwords do not match');
    if (newPass.length < 8) return Alert.alert('Weak Password', 'Minimum 8 characters required');

    setSavingPasswordState(true);
    try {
      await retry(() => changePassword(curPass, newPass), 3, 300);
      showToast('Password changed successfully');
      setCurPass('');
      setNewPass('');
      setConfirmPass('');
      toggleCard('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Update failed');
    } finally {
      setSavingPasswordState(false);
    }
  }, [curPass, newPass, confirmPass]);

  const handleDelete = useCallback(async () => {
    Alert.alert('Delete Account?', 'This is permanent. All your data will be wiped.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Forever',
        style: 'destructive',
        onPress: async () => {
          setDeletingAccount(true);
          try {
            await retry(() => deleteAccount(), 3, 500);
            showToast('Account deleted');
            navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
          } catch (err: any) {
            Alert.alert('Error', err?.message);
          } finally {
            setDeletingAccount(false);
          }
        },
      },
    ]);
  }, []);

  const userInitial = user?.name?.trim().charAt(0).toUpperCase() || 'U';

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
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
              {/* HERO PROFILE ROW */}
              <View style={styles.heroRow}>
                <View style={styles.heroAvatar}>
                  <Text style={styles.heroAvatarText}>{userInitial}</Text>
                  <View style={styles.verifiedBadge}>
                    <MaterialIcon name="check" size={12} color="white" />
                  </View>
                </View>
                <View style={styles.heroInfo}>
                  <Text style={styles.heroName}>{user?.name || 'Guest User'}</Text>
                  <Text style={styles.heroEmail}>{user?.email || 'No email linked'}</Text>
                </View>
              </View>

              {/* 1. NAME SECTION */}
              <ExpandableCard
                item={{
                  id: 'username',
                  title: 'Personal Info',
                  description: 'Update display name',
                  icon: 'person-outline',
                  bgColor: '#EEF2FF',
                  iconColor: colors.primary,
                }}
                index={0}
                isExpanded={activeCard === 'username'}
                onToggle={() => toggleCard('username')}
              >
                <CustomInput
                  label="Full Name"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Your Name"
                  leftIcon={<MaterialIcon name="badge" size={20} color={colors.muted} />}
                />
                <Button
                  title="Save Changes"
                  loading={savingUsername}
                  onPress={handleSaveUsername}
                  buttonStyle={styles.primaryBtn}
                  titleStyle={styles.btnText}
                />
              </ExpandableCard>

              {/* 2. EMAIL SECTION */}
              <ExpandableCard
                item={{
                  id: 'email',
                  title: 'Email Address',
                  description: 'Manage login email',
                  icon: 'mail-outline',
                  bgColor: '#ECFDF5',
                  iconColor: colors.accentGreen,
                }}
                index={1}
                isExpanded={activeCard === 'email'}
                onToggle={() => toggleCard('email')}
              >
                <CustomInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon={<MaterialIcon name="email" size={20} color={colors.muted} />}
                />
                <Button
                  title="Update Email"
                  loading={savingEmail}
                  onPress={handleSaveEmail}
                  buttonStyle={styles.primaryBtn}
                  titleStyle={styles.btnText}
                />
              </ExpandableCard>

              {/* 3. PASSWORD SECTION */}
              <ExpandableCard
                item={{
                  id: 'password',
                  title: 'Security',
                  description: 'Change password',
                  icon: 'lock-outline',
                  bgColor: '#FEF3C7',
                  iconColor: colors.accentOrange,
                }}
                index={2}
                isExpanded={activeCard === 'password'}
                onToggle={() => toggleCard('password')}
              >
                <CustomInput
                  label="Current Password"
                  secureTextEntry={!showCur}
                  value={curPass}
                  onChangeText={setCurPass}
                  rightIcon={
                    <MaterialIcon
                      name={showCur ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={colors.muted}
                      onPress={() => setShowCur(!showCur)}
                    />
                  }
                />
                <CustomInput
                  label="New Password"
                  secureTextEntry={!showNew}
                  value={newPass}
                  onChangeText={setNewPass}
                  rightIcon={
                    <MaterialIcon
                      name={showNew ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={colors.muted}
                      onPress={() => setShowNew(!showNew)}
                    />
                  }
                />
                <CustomInput
                  label="Confirm New Password"
                  secureTextEntry={!showConfirm}
                  value={confirmPass}
                  onChangeText={setConfirmPass}
                  rightIcon={
                    <MaterialIcon
                      name={showConfirm ? 'visibility' : 'visibility-off'}
                      size={20}
                      color={colors.muted}
                      onPress={() => setShowConfirm(!showConfirm)}
                    />
                  }
                />
                <Button
                  title="Update Password"
                  loading={savingPasswordState}
                  onPress={handlePasswordSave}
                  buttonStyle={styles.primaryBtn}
                  titleStyle={styles.btnText}
                />
              </ExpandableCard>

              {/* 4. DELETE SECTION */}
              <ExpandableCard
                item={{
                  id: 'delete',
                  title: 'Delete Account',
                  description: 'Permanently remove data',
                  icon: 'delete-outline',
                  bgColor: '#FEE2E2',
                  iconColor: colors.accentRed,
                }}
                index={3}
                isExpanded={activeCard === 'delete'}
                onToggle={() => toggleCard('delete')}
              >
                <View style={styles.dangerZone}>
                  <Text style={styles.dangerText}>
                    Warning: This action is irreversible. All your transactions, settings, and data
                    will be permanently deleted.
                  </Text>
                  <Button
                    title="Delete Forever"
                    buttonStyle={styles.destructiveBtn}
                    onPress={handleDelete}
                    loading={deletingAccount}
                    icon={
                      <MaterialIcon
                        name="delete-forever"
                        size={20}
                        color="white"
                        style={{ marginRight: 8 }}
                      />
                    }
                  />
                </View>
              </ExpandableCard>

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
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10,
  },

  /* HERO ROW */
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  heroAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    position: 'relative',
  },
  heroAvatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.primary,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  heroEmail: {
    fontSize: 14,
    color: colors.muted,
  },

  /* CARDS */
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardExpanded: {
    borderColor: colors.primary, // Highlight border when open
    backgroundColor: '#fff',
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
    color: colors.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    color: colors.muted,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },

  /* INPUTS & BUTTONS */
  inputContainer: {
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  inputField: {
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
  },
  inputText: {
    fontSize: 15,
    color: colors.text,
  },
  inputLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 4,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
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
  dangerText: {
    color: '#7f1d1d',
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 16,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    lineHeight: 20,
  },
  destructiveBtn: {
    backgroundColor: colors.accentRed,
    paddingVertical: 12,
    borderRadius: 12,
    width: '100%',
  },
});

export default AccountManagementScreen;
