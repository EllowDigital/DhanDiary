import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Text,
  SafeAreaView,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  Easing,
} from 'react-native';
import { Input, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

import { updateProfile, changePassword, deleteAccount } from '../services/auth';
import { saveSession } from '../db/session';
import { retry } from '../utils/retry';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../utils/design';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AccountManagementScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const [activeCard, setActiveCard] = useState<'username' | 'email' | 'password' | 'delete' | null>(
    null
  );

  /* -------------------------
        FORM STATES
    -------------------------- */
  const [username, setUsername] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  // password visibility toggles
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [savingUsername, setSavingUsername] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPasswordState, setSavingPasswordState] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const fadeOrder = ['hero', 'username', 'email', 'password', 'delete'] as const;
  const fadeRefs = useRef(fadeOrder.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = fadeRefs.map((val, idx) =>
      Animated.timing(val, {
        toValue: 1,
        duration: 450,
        delay: idx * 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    Animated.stagger(120, animations).start();
  }, [fadeRefs]);

  const animatedStyle = (index: number) => ({
    opacity: fadeRefs[index],
    transform: [
      {
        translateY: fadeRefs[index].interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
    ],
  });

  const toggleCard = (id: 'username' | 'email' | 'password' | 'delete') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveCard((prev) => (prev === id ? null : id));
  };

  /* -------------------------
        SAVE USERNAME
    -------------------------- */
  const handleSaveUsername = useCallback(async () => {
    setSavingUsername(true);
    try {
      await retry(() => updateProfile({ name: username }), 3, 250);
      showToast('Username updated');
      setActiveCard(null);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update username');
    } finally {
      setSavingUsername(false);
    }
  }, [username]);

  /* -------------------------
        SAVE EMAIL
    -------------------------- */
  const handleSaveEmail = useCallback(async () => {
    setSavingEmail(true);
    try {
      // Optimistic local update so UI feels fast
      if (user && (user as any).id) {
        await saveSession((user as any).id, user?.name || '', email || '');
        showToast('Email saved locally');
      }

      // Run the remote update in background; don't block the UI.
      (async () => {
        try {
          await retry(() => updateProfile({ email }), 3, 250);
          showToast('Email updated');
          setActiveCard(null);
        } catch (err: any) {
          // If remote update fails, surface a toast but keep local value
          showToast('Failed to update email remotely: ' + (err?.message || 'Try again'));
        }
      })();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update email');
    } finally {
      // stop spinner quickly to keep UI responsive
      setSavingEmail(false);
    }
  }, [email, user]);

  /* -------------------------
        SAVE PASSWORD
    -------------------------- */
  const handlePasswordSave = useCallback(async () => {
    if (!curPass || !newPass || !confirmPass)
      return Alert.alert('Validation', 'Fill all password fields');

    if (newPass !== confirmPass) return Alert.alert('Validation', 'New passwords do not match');

    // Quick client-side validations
    if (newPass.length < 8 || !/[0-9]/.test(newPass))
      return Alert.alert(
        'Validation',
        'Password must be at least 8 characters and include a number'
      );

    // Make UI responsive: show a brief spinner and run heavy remote work in background
    setSavingPasswordState(true);
    // clear spinner quickly so UI isn't blocked
    setTimeout(() => setSavingPasswordState(false), 700);

    (async () => {
      try {
        // attempt change with retry; this may take time but runs in background
        await retry(() => changePassword(curPass, newPass), 3, 300);
        showToast('Password updated');
        setCurPass('');
        setNewPass('');
        setConfirmPass('');
        setActiveCard(null);
      } catch (err: any) {
        // notify user asynchronously
        showToast('Password change failed: ' + (err?.message || 'Try again'));
      }
    })();
  }, [curPass, newPass, confirmPass]);

  /* -------------------------
        DELETE ACCOUNT
    -------------------------- */
  const handleDelete = useCallback(async () => {
    Alert.alert('Delete Account', 'This action cannot be undone!', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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

  const sectionConfig = useMemo(
    () => [
      {
        id: 'username' as const,
        title: 'Profile Name',
        description: 'Update the name shown across the app',
        icon: 'person',
        color: colors.primary,
        render: () => (
          <>
            <Input
              label="Display Name"
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your name"
            />
            <Button
              title="Save Name"
              loading={savingUsername}
              onPress={handleSaveUsername}
              buttonStyle={styles.primaryBtn}
            />
          </>
        ),
      },
      {
        id: 'email' as const,
        title: 'Email Address',
        description: 'Used for login and updates',
        icon: 'mail',
        color: colors.accentGreen,
        render: () => (
          <>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Button
              title="Save Email"
              loading={savingEmail}
              onPress={handleSaveEmail}
              buttonStyle={styles.primaryBtn}
            />
          </>
        ),
      },
      {
        id: 'password' as const,
        title: 'Password',
        description: 'Choose a strong password with at least 8 characters',
        icon: 'lock',
        color: colors.accentOrange,
        render: () => (
          <>
            <Input
              label="Current Password"
              secureTextEntry={!showCur}
              value={curPass}
              onChangeText={setCurPass}
              placeholder="••••••••"
              rightIcon={
                <MaterialIcon
                  name={showCur ? 'visibility' : 'visibility-off'}
                  size={22}
                  onPress={() => setShowCur(!showCur)}
                />
              }
            />
            <Input
              label="New Password"
              secureTextEntry={!showNew}
              value={newPass}
              onChangeText={setNewPass}
              placeholder="••••••••"
              rightIcon={
                <MaterialIcon
                  name={showNew ? 'visibility' : 'visibility-off'}
                  size={22}
                  onPress={() => setShowNew(!showNew)}
                />
              }
            />
            <Input
              label="Confirm Password"
              secureTextEntry={!showConfirm}
              value={confirmPass}
              onChangeText={setConfirmPass}
              placeholder="••••••••"
              rightIcon={
                <MaterialIcon
                  name={showConfirm ? 'visibility' : 'visibility-off'}
                  size={22}
                  onPress={() => setShowConfirm(!showConfirm)}
                />
              }
            />
            <Button
              title="Update Password"
              loading={savingPasswordState}
              onPress={handlePasswordSave}
              buttonStyle={styles.primaryBtn}
            />
          </>
        ),
      },
      {
        id: 'delete' as const,
        title: 'Delete Account',
        description: 'Permanently remove your data from DhanDiary',
        icon: 'delete-forever',
        color: colors.accentRed,
        render: () => (
          <>
            <Text style={styles.warning}>This action cannot be undone.</Text>
            <Button
              title="Delete Account"
              buttonStyle={styles.destructiveBtn}
              onPress={handleDelete}
              loading={deletingAccount}
            />
          </>
        ),
      },
    ],
    [
      username,
      savingUsername,
      handleSaveUsername,
      email,
      savingEmail,
      handleSaveEmail,
      curPass,
      newPass,
      confirmPass,
      showCur,
      showNew,
      showConfirm,
      savingPasswordState,
      handlePasswordSave,
      handleDelete,
      deletingAccount,
    ]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentContainer}>
        <Animated.View style={[styles.heroCard, animatedStyle(0)]}>
          <Text style={styles.heroTitle}>Account Center</Text>
          <Text style={styles.heroSubtitle}>Manage your profile and security settings in one place.</Text>
          <View style={styles.heroRow}>
            <View style={styles.heroBadge}>
              <MaterialIcon name="person" size={20} color={colors.primary} />
              <Text style={styles.heroBadgeText}>{user?.name || 'Guest user'}</Text>
            </View>
            <View style={styles.heroBadge}>
              <MaterialIcon name="email" size={20} color={colors.primary} />
              <Text style={styles.heroBadgeText}>{user?.email || 'No email'}</Text>
            </View>
          </View>
        </Animated.View>

        {sectionConfig.map((section, idx) => {
          const expanded = activeCard === section.id;
          return (
            <Animated.View
              key={section.id}
              style={[styles.card, animatedStyle(idx + 1), expanded && styles.cardExpanded]}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.cardHeader}
                onPress={() => toggleCard(section.id)}
              >
                <View style={[styles.cardIcon, { backgroundColor: `${section.color}15` }]}> 
                  <MaterialIcon name={section.icon as any} size={22} color={section.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{section.title}</Text>
                  <Text style={styles.cardDescription}>{section.description}</Text>
                </View>
                <MaterialIcon
                  name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={24}
                  color={colors.mutedSoft}
                />
              </TouchableOpacity>
              {expanded && <View style={styles.formContent}>{section.render()}</View>}
            </Animated.View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

/* ----------------------------
      STYLES
----------------------------- */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: colors.softCard,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: colors.muted,
    marginTop: 8,
    fontSize: 14,
  },
  heroRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 12,
    flexWrap: 'wrap',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  heroBadgeText: {
    color: colors.primary,
    marginLeft: 8,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 18,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardExpanded: {
    paddingBottom: 24,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  formContent: {
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  warning: {
    textAlign: 'center',
    marginBottom: 16,
    color: colors.accentOrange,
    fontWeight: '600',
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 6,
    backgroundColor: colors.primary,
  },
  destructiveBtn: {
    backgroundColor: colors.accentRed,
    borderRadius: 14,
    paddingVertical: 12,
  },
});

export default AccountManagementScreen;
