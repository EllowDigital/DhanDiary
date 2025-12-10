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
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Logic Imports
import { updateProfile, changePassword, deleteAccount } from '../services/auth';
import { saveSession } from '../db/session';
import { retry } from '../utils/retry';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../utils/design';
import ScreenHeader from '../components/ScreenHeader';

// --- FIX FOR WARNING ---
// Only enable legacy layout animation if NOT on New Architecture (Fabric)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  const { nativeFabricUIManager } = globalThis as {
    nativeFabricUIManager?: unknown;
  };
  if (!nativeFabricUIManager) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- FIXED COMPONENT: Defined OUTSIDE to prevent keyboard closing ---
const CustomInput = ({ containerStyle, ...props }: any) => (
  <Input
    {...props}
    containerStyle={[styles.inputContainer, containerStyle]}
    inputContainerStyle={styles.inputField}
    inputStyle={styles.inputText}
    labelStyle={styles.inputLabel}
    placeholderTextColor={colors.muted}
  />
);

// --- EXPANDABLE CARD COMPONENT ---
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
  const heightAnim = useRef(new Animated.Value(0)).current;
  const entryAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance Animation
    Animated.timing(entryAnim, {
      toValue: 1,
      duration: 500,
      delay: index * 100,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, []);

  useEffect(() => {
    // Expand/Collapse Animation
    Animated.timing(heightAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // Layout properties cannot use native driver
      easing: Easing.inOut(Easing.ease),
    }).start();
  }, [isExpanded]);

  const bodyHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 450], // Max height sufficient for content
  });

  const entryTranslate = entryAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  return (
    <Animated.View
      style={[
        styles.card,
        isExpanded && styles.cardExpanded,
        item.id === 'delete' && styles.cardDanger,
        { opacity: entryAnim, transform: [{ translateY: entryTranslate }] },
      ]}
    >
      <TouchableOpacity activeOpacity={0.8} style={styles.cardHeader} onPress={onToggle}>
        <View style={[styles.iconBox, { backgroundColor: `${item.color}15` }]}>
          <MaterialIcon name={item.icon} size={22} color={item.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, item.id === 'delete' && { color: colors.accentRed }]}>
            {item.title}
          </Text>
          <Text style={styles.cardDesc}>{item.description}</Text>
        </View>
        <MaterialIcon
          name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
          size={24}
          color={colors.muted}
        />
      </TouchableOpacity>

      <Animated.View style={{ maxHeight: bodyHeight, overflow: 'hidden' }}>
        <View style={styles.cardBody}>{children}</View>
      </Animated.View>
    </Animated.View>
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

  // Password
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

  const toggleCard = (id: string) => {
    // Only dismiss keyboard if we are CLOSING the card or switching to another
    // But expanding a card should generally be safe.
    if (activeCard !== id) Keyboard.dismiss();
    setActiveCard((prev) => (prev === id ? null : id));
  };

  // --- HANDLERS ---
  const handleSaveUsername = useCallback(async () => {
    if (!username.trim()) return Alert.alert('Validation', 'Name cannot be empty');
    setSavingUsername(true);
    try {
      await retry(() => updateProfile({ name: username }), 3, 250);
      showToast('Name updated');
      toggleCard('username');
    } catch (err: any) {
      Alert.alert('Error', err?.message);
    } finally {
      setSavingUsername(false);
    }
  }, [username]);

  const handleSaveEmail = useCallback(async () => {
    setSavingEmail(true);
    try {
      if (user && (user as any).id) {
        await saveSession((user as any).id, user?.name || '', email || '');
      }
      (async () => {
        try {
          await retry(() => updateProfile({ email }), 3, 250);
          showToast('Email updated');
          toggleCard('email');
        } catch (err: any) {
          showToast('Sync failed: ' + (err?.message || 'Check connection'));
        }
      })();
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
      showToast('Password changed');
      setCurPass('');
      setNewPass('');
      setConfirmPass('');
      toggleCard('password');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Update failed');
    } finally {
      setSavingPasswordState(false);
    }
  }, [curPass, newPass, confirmPass]);

  const handleDelete = useCallback(async () => {
    Alert.alert('Delete Account?', 'This cannot be undone. All data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Forever',
        style: 'destructive',
        onPress: async () => {
          setDeletingAccount(true);
          try {
            await retry(() => deleteAccount(), 3, 500);
            showToast('Account deleted');
            navigation.replace('Auth');
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
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          // Android often needs a small offset if you have headers
          keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled" // Allows buttons to work while keyboard is up
          >
            {/* HERO SECTION */}
            <View style={styles.heroCard}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>{userInitial}</Text>
              </View>
              <Text style={styles.heroName}>{user?.name || 'Guest User'}</Text>
              <Text style={styles.heroEmail}>{user?.email || 'No email linked'}</Text>
            </View>

            {/* NAME SECTION */}
            <ExpandableCard
              item={{
                id: 'username',
                title: 'Profile Name',
                description: 'Update your display name',
                icon: 'badge',
                color: colors.primary,
              }}
              index={0}
              isExpanded={activeCard === 'username'}
              onToggle={() => toggleCard('username')}
            >
              <CustomInput
                label="Full Name"
                value={username}
                onChangeText={setUsername}
                placeholder="John Doe"
              />
              <Button
                title="Save Changes"
                loading={savingUsername}
                onPress={handleSaveUsername}
                buttonStyle={styles.primaryBtn}
                containerStyle={styles.btnContainer}
              />
            </ExpandableCard>

            {/* EMAIL SECTION */}
            <ExpandableCard
              item={{
                id: 'email',
                title: 'Email Address',
                description: 'Manage login email',
                icon: 'alternate-email',
                color: colors.accentGreen,
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
              />
              <Button
                title="Update Email"
                loading={savingEmail}
                onPress={handleSaveEmail}
                buttonStyle={styles.primaryBtn}
                containerStyle={styles.btnContainer}
              />
            </ExpandableCard>

            {/* PASSWORD SECTION */}
            <ExpandableCard
              item={{
                id: 'password',
                title: 'Security',
                description: 'Change password',
                icon: 'lock-outline',
                color: colors.accentOrange,
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
                containerStyle={styles.btnContainer}
              />
            </ExpandableCard>

            {/* DELETE SECTION */}
            <ExpandableCard
              item={{
                id: 'delete',
                title: 'Delete Account',
                description: 'Permanently remove data',
                icon: 'delete-outline',
                color: colors.accentRed,
              }}
              index={3}
              isExpanded={activeCard === 'delete'}
              onToggle={() => toggleCard('delete')}
            >
              <View style={styles.dangerZoneInner}>
                <Text style={styles.warningText}>
                  Warning: This action is permanent. All your data will be wiped.
                </Text>
                <Button
                  title="Delete Account"
                  buttonStyle={styles.destructiveBtn}
                  onPress={handleDelete}
                  loading={deletingAccount}
                  icon={
                    <MaterialIcon
                      name="delete-forever"
                      size={18}
                      color="white"
                      style={{ marginRight: 8 }}
                    />
                  }
                />
              </View>
            </ExpandableCard>

            <View style={{ height: 100 }} />
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
    flexGrow: 1,
  },
  /* HERO */
  heroCard: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 10,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 4,
    borderColor: colors.card,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.primary,
  },
  heroName: {
    fontSize: 22,
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
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardExpanded: {
    borderColor: colors.primary,
  },
  cardDanger: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardDesc: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  cardBody: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  /* FORMS & INPUTS */
  inputContainer: {
    paddingHorizontal: 0,
    marginBottom: 4,
  },
  inputField: {
    backgroundColor: colors.surfaceMuted || '#F3F4F6',
    borderBottomWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
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
  btnContainer: {
    marginTop: 8,
    borderRadius: 12,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  /* DELETE SECTION */
  dangerZoneInner: {
    alignItems: 'center',
  },
  warningText: {
    color: colors.accentRed,
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 16,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
    width: '100%',
  },
  destructiveBtn: {
    backgroundColor: colors.accentRed,
    paddingVertical: 12,
    borderRadius: 12,
    width: '100%',
  },
});

export default AccountManagementScreen;
