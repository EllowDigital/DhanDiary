import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { Text, Input, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

import Animated, {
  useSharedValue,
  withTiming,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { updateProfile, changePassword, deleteAccount } from '../services/auth';
import { saveSession } from '../db/session';
import { retry } from '../utils/retry';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../context/ToastContext';
import { useNavigation } from '@react-navigation/native';

const AccountManagementScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const [activeCard, setActiveCard] = useState<'username' | 'email' | 'password' | 'delete' | null>(
    null
  );

  /* -------------------------
        FIXED FLIP ANIMATION
    -------------------------- */
  const flip = useSharedValue(0);

  useEffect(() => {
    flip.value = withTiming(activeCard ? 180 : 0, { duration: 480 });
  }, [activeCard]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(flip.value, [0, 180], [0, 180])}deg` }],
    opacity: flip.value < 90 ? 1 : 0,
    pointerEvents: flip.value < 90 ? 'auto' : 'none',
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [{ rotateY: `${interpolate(flip.value, [0, 180], [180, 360])}deg` }],
    opacity: flip.value > 90 ? 1 : 0,
    pointerEvents: flip.value > 90 ? 'auto' : 'none',
  }));

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

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={{ marginTop: 20, minHeight: 520 }}>
        {/* FRONT MENU */}
        <Animated.View style={[styles.card, frontStyle]}>
          <Text style={styles.header}>Manage Account</Text>

          <TouchableOpacity style={styles.row} onPress={() => setActiveCard('username')}>
            <MaterialIcon name="person" size={22} color="#1F74E8" />
            <Text style={styles.rowText}>Change Username</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => setActiveCard('email')}>
            <MaterialIcon name="mail" size={22} color="#4CAF50" />
            <Text style={styles.rowText}>Change Email</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => setActiveCard('password')}>
            <MaterialIcon name="lock" size={22} color="#F59E0B" />
            <Text style={styles.rowText}>Change Password</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={() => setActiveCard('delete')}>
            <MaterialIcon name="delete-forever" size={22} color="#EF4444" />
            <Text style={[styles.rowText, { color: '#EF4444' }]}>Delete Account</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* BACK FORMS */}
        <Animated.View style={[styles.card, backStyle]}>
          {/* USERNAME */}
          {activeCard === 'username' && (
            <>
              <Text style={styles.header}>Update Username</Text>

              <Input label="Username" value={username} onChangeText={setUsername} />

              <Button title="Save Username" loading={savingUsername} onPress={handleSaveUsername} />
              <Button title="Back" type="clear" onPress={() => setActiveCard(null)} />
            </>
          )}

          {/* EMAIL */}
          {activeCard === 'email' && (
            <>
              <Text style={styles.header}>Update Email</Text>

              <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />

              <Button title="Save Email" loading={savingEmail} onPress={handleSaveEmail} />
              <Button title="Back" type="clear" onPress={() => setActiveCard(null)} />
            </>
          )}

          {/* PASSWORD */}
          {activeCard === 'password' && (
            <>
              <Text style={styles.header}>Change Password</Text>

              <Input
                label="Current Password"
                secureTextEntry={!showCur}
                value={curPass}
                onChangeText={setCurPass}
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
                rightIcon={
                  <MaterialIcon
                    name={showNew ? 'visibility' : 'visibility-off'}
                    size={22}
                    onPress={() => setShowNew(!showNew)}
                  />
                }
              />

              <Input
                label="Confirm New Password"
                secureTextEntry={!showConfirm}
                value={confirmPass}
                onChangeText={setConfirmPass}
                rightIcon={
                  <MaterialIcon
                    name={showConfirm ? 'visibility' : 'visibility-off'}
                    size={22}
                    onPress={() => setShowConfirm(!showConfirm)}
                  />
                }
              />

              <Button
                title="Save Password"
                loading={savingPasswordState}
                onPress={handlePasswordSave}
              />
              <Button title="Back" type="clear" onPress={() => setActiveCard(null)} />
            </>
          )}

          {/* DELETE */}
          {activeCard === 'delete' && (
            <>
              <Text style={[styles.header, { color: 'red' }]}>Delete Account</Text>

              <Text style={styles.warning}>This action is irreversible.</Text>

              <Button
                title="Delete Account"
                buttonStyle={{ backgroundColor: 'red' }}
                onPress={handleDelete}
                loading={deletingAccount}
              />

              <Button title="Back" type="clear" onPress={() => setActiveCard(null)} />
            </>
          )}
        </Animated.View>
      </View>
    </ScrollView>
  );
};

/* ----------------------------
      STYLES
----------------------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
  },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 18,
    elevation: 4,
    minHeight: 440,
    justifyContent: 'center',
    position: 'absolute',
    width: '100%',
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rowText: {
    marginLeft: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  warning: {
    textAlign: 'center',
    marginBottom: 12,
    color: '#444',
  },
});

export default AccountManagementScreen;
