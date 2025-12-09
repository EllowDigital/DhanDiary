import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Text,
  LayoutAnimation,
  Platform,
  Animated,
  Easing,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

// Services & Context
import { updateProfile, changePassword, deleteAccount } from '../services/auth';
import { saveSession } from '../db/session';
import { retry } from '../utils/retry';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../utils/design'; // Assuming spacing is available
import { enableLegacyLayoutAnimations } from '../utils/layoutAnimation';
import ScreenHeader from '../components/ScreenHeader';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  enableLegacyLayoutAnimations();
}

const AccountManagementScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const [activeCard, setActiveCard] = useState<'username' | 'email' | 'password' | 'delete' | null>(null);

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

  // Loading States
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPasswordState, setSavingPasswordState] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // --- ENTRY ANIMATION ---
  // Using standard Animated to avoid Reanimated crashes
  const fadeAnims = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = fadeAnims.map((anim, idx) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 500,
        delay: idx * 100, // Staggered effect
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.stagger(50, animations).start();
  }, []);

  const getAnimStyle = (index: number) => ({
    opacity: fadeAnims[index],
    transform: [
      {
        translateY: fadeAnims[index].interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  });

  const toggleCard = (id: 'username' | 'email' | 'password' | 'delete') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveCard((prev) => (prev === id ? null : id));
  };

  // --- HANDLERS ---

  const handleSaveUsername = useCallback(async () => {
    if (!username.trim()) return Alert.alert('Validation', 'Name cannot be empty');
    setSavingUsername(true);
    try {
      await retry(() => updateProfile({ name: username }), 3, 250);
      showToast('Profile name updated');
      toggleCard('username'); // Auto close on success
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update username');
    } finally {
      setSavingUsername(false);
    }
  }, [username]);

  const handleSaveEmail = useCallback(async () => {
    setSavingEmail(true);
    try {
      // Optimistic Update
      
      if (user && (user as any).id) {
        await saveSession((user as any).id, user?.name || '', email || '');
      }

      // Background Sync
      (async () => {
        try {
          await retry(() => updateProfile({ email }), 3, 250);
          showToast('Email address updated');
          toggleCard('email');
        } catch (err: any) {
          showToast('Remote update failed: ' + (err?.message || 'Check connection'));
        }
      })();
    } catch (err: any) {
      Alert.alert('Error', err?.message);
    } finally {
      setSavingEmail(false);
    }
  }, [email, user]);

  const handlePasswordSave = useCallback(async () => {
    if (!curPass || !newPass || !confirmPass) return Alert.alert('Missing Fields', 'Please fill in all password fields.');
    if (newPass !== confirmPass) return Alert.alert('Mismatch', 'New passwords do not match.');
    if (newPass.length < 8) return Alert.alert('Weak Password', 'Password must be at least 8 characters.');

    setSavingPasswordState(true);
    
    // Non-blocking UX
    setTimeout(() => {
        // Just in case the promise hangs, we unblock the button after 2s
        if(savingPasswordState) setSavingPasswordState(false);
    }, 5000);

    try {
      await retry(() => changePassword(curPass, newPass), 3, 300);
      showToast('Password updated successfully');
      setCurPass(''); setNewPass(''); setConfirmPass('');
      toggleCard('password');
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Could not change password.');
    } finally {
      setSavingPasswordState(false);
    }
  }, [curPass, newPass, confirmPass]);

  const handleDelete = useCallback(async () => {
    Alert.alert('Delete Account?', 'This action is permanent and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Permanently',
        style: 'destructive',
        onPress: async () => {
          setDeletingAccount(true);
          try {
            await retry(() => deleteAccount(), 3, 500);
            showToast('Account deleted');
            navigation.replace('Auth');
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to delete account');
          } finally {
            setDeletingAccount(false);
          }
        },
      },
    ]);
  }, []);

  // --- RENDER HELPERS ---
  const userInitial = user?.name?.trim().charAt(0).toUpperCase() || 'U';

  const CustomInput = (props: any) => (
    <Input
      {...props}
      containerStyle={styles.inputContainer}
      inputContainerStyle={styles.inputField}
      inputStyle={styles.inputText}
      labelStyle={styles.inputLabel}
      placeholderTextColor={colors.muted}
    />
  );

  // --- COMPONENT CONFIG ---
  const sectionConfig = useMemo(() => [
    {
      id: 'username' as const,
      title: 'Profile Name',
      description: 'Update how you appear in the app',
      icon: 'badge',
      color: colors.primary,
      content: (
        <>
          <CustomInput
            label="Display Name"
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. John Doe"
          />
          <Button
            title="Save Changes"
            loading={savingUsername}
            onPress={handleSaveUsername}
            buttonStyle={styles.primaryBtn}
            containerStyle={styles.btnContainer}
          />
        </>
      ),
    },
    {
      id: 'email' as const,
      title: 'Email Address',
      description: 'Manage your login email',
      icon: 'alternate-email',
      color: colors.accentGreen,
      content: (
        <>
          <CustomInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Button
            title="Update Email"
            loading={savingEmail}
            onPress={handleSaveEmail}
            buttonStyle={styles.primaryBtn}
            containerStyle={styles.btnContainer}
          />
        </>
      ),
    },
    {
      id: 'password' as const,
      title: 'Security',
      description: 'Change your password',
      icon: 'lock-outline',
      color: colors.accentOrange,
      content: (
        <>
          <CustomInput
            label="Current Password"
            secureTextEntry={!showCur}
            value={curPass}
            onChangeText={setCurPass}
            rightIcon={<MaterialIcon name={showCur ? 'visibility' : 'visibility-off'} size={20} color={colors.muted} onPress={() => setShowCur(!showCur)} />}
          />
          <CustomInput
            label="New Password"
            secureTextEntry={!showNew}
            value={newPass}
            onChangeText={setNewPass}
            rightIcon={<MaterialIcon name={showNew ? 'visibility' : 'visibility-off'} size={20} color={colors.muted} onPress={() => setShowNew(!showNew)} />}
          />
          <CustomInput
            label="Confirm New Password"
            secureTextEntry={!showConfirm}
            value={confirmPass}
            onChangeText={setConfirmPass}
            rightIcon={<MaterialIcon name={showConfirm ? 'visibility' : 'visibility-off'} size={20} color={colors.muted} onPress={() => setShowConfirm(!showConfirm)} />}
          />
          <Button
            title="Update Password"
            loading={savingPasswordState}
            onPress={handlePasswordSave}
            buttonStyle={styles.primaryBtn}
            containerStyle={styles.btnContainer}
          />
        </>
      ),
    },
    {
      id: 'delete' as const,
      title: 'Delete Account',
      description: 'Permanently remove your data',
      icon: 'delete-outline',
      color: colors.accentRed,
      content: (
        <View style={styles.dangerZoneInner}>
          <Text style={styles.warningText}>
            Warning: This action will permanently delete your account and all associated data.
          </Text>
          <Button
            title="Delete Account"
            buttonStyle={styles.destructiveBtn}
            onPress={handleDelete}
            loading={deletingAccount}
            icon={<MaterialIcon name="delete-forever" size={18} color="white" style={{marginRight:8}} />}
          />
        </View>
      ),
    },
  ], [username, email, curPass, newPass, confirmPass, showCur, showNew, showConfirm, savingUsername, savingEmail, savingPasswordState, deletingAccount]);

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Account" subtitle="Profile & Security" showScrollHint={false} />
        
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            
            {/* HERO SECTION */}
            <Animated.View style={[styles.heroCard, getAnimStyle(0)]}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>{userInitial}</Text>
              </View>
              <Text style={styles.heroName}>{user?.name || 'Guest User'}</Text>
              <Text style={styles.heroEmail}>{user?.email || 'No email linked'}</Text>
            </Animated.View>

            {/* SECTIONS */}
            {sectionConfig.map((section, idx) => {
              const isExpanded = activeCard === section.id;
              return (
                <Animated.View 
                    key={section.id} 
                    style={[
                        styles.card, 
                        isExpanded && styles.cardExpanded, 
                        section.id === 'delete' && styles.cardDanger,
                        getAnimStyle(idx + 1)
                    ]}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.cardHeader}
                    onPress={() => toggleCard(section.id)}
                  >
                    <View style={[styles.iconBox, { backgroundColor: `${section.color}15` }]}>
                      <MaterialIcon name={section.icon as any} size={22} color={section.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, section.id === 'delete' && { color: colors.accentRed }]}>
                        {section.title}
                      </Text>
                      <Text style={styles.cardDesc}>{section.description}</Text>
                    </View>
                    <MaterialIcon
                      name={isExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                      size={24}
                      color={colors.muted}
                    />
                  </TouchableOpacity>
                  
                  {isExpanded && (
                    <View style={styles.cardBody}>
                        {section.content}
                    </View>
                  )}
                </Animated.View>
              );
            })}
            
            <View style={{ height: 40 }} />
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
    borderColor: colors.primary, // Highlight border when open
  },
  cardDanger: {
    borderColor: 'rgba(239, 68, 68, 0.3)', // Red border for delete
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
    backgroundColor: colors.surfaceMuted || '#F3F4F6', // Light gray bg
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