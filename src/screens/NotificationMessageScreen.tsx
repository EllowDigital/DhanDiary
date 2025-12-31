import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TextInput, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { subscribeBanner, isBannerVisible } from '../utils/bannerState';
import { Text, Button } from '@rneui/themed';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScreenHeader from '../components/ScreenHeader';
import { colors } from '../utils/design';

const STORAGE_KEY = 'dev_notification_message_v1';

const NotificationMessageScreen: React.FC = () => {
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (v) setMessage(v);
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const [bannerVisible, setBannerVisible] = React.useState<boolean>(false);
  React.useEffect(() => {
    setBannerVisible(isBannerVisible());
    const unsub = subscribeBanner((v: boolean) => setBannerVisible(v));
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const save = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, message || '');
      setEditing(false);
    } catch (e) {
      Alert.alert('Save failed', 'Unable to save message.');
    }
  };

  const remove = async () => {
    Alert.alert('Remove message', 'Remove developer message?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await AsyncStorage.removeItem(STORAGE_KEY);
            setMessage('');
            setEditing(false);
          } catch (e) {
            Alert.alert('Remove failed', 'Unable to remove message.');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={bannerVisible ? (['left', 'right'] as any) : (['top', 'left', 'right'] as any)}
    >
      <ScreenHeader
        title="Notifications"
        subtitle="Developer messages"
        useSafeAreaPadding={false}
      />
      <View style={styles.content}>
        <Text style={styles.label}>Message from developer</Text>
        <Text style={styles.help}>
          Show a short announcement about last changes and improvements.
        </Text>

        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="Type developer message here"
          multiline
          editable={editing}
          style={[styles.input, editing ? styles.inputEdit : styles.inputView]}
        />

        <View style={styles.actionsRow}>
          {editing ? (
            <Button title="Save" onPress={save} color={colors.primary} disabled={loading} />
          ) : (
            <Button title="Edit" onPress={() => setEditing(true)} color={colors.primary} />
          )}

          <Button
            title="Remove"
            onPress={remove}
            color={colors.accentRed || '#EF4444'}
            buttonStyle={{ marginLeft: 12 }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  help: { fontSize: 12, color: colors.muted, marginBottom: 12 },
  input: {
    minHeight: 120,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E6E8EB',
    textAlignVertical: 'top',
  },
  inputEdit: { backgroundColor: '#fff' },
  inputView: { backgroundColor: '#F8FAFC' },
  actionsRow: { flexDirection: 'row', marginTop: 12 },
});

export default NotificationMessageScreen;
