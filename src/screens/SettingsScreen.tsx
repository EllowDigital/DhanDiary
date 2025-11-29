import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';

import { logout } from '../services/auth';
import { useAuth } from '../hooks/useAuth';
import { syncBothWays, getLastSyncTime, getLastSyncCount } from '../services/syncManager';
import { clearAllData } from '../db/localDb';

import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../context/ToastContext';

const SettingsScreen = () => {
  const navigation = useNavigation<any>();
  const query = useQueryClient();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [lastSyncedCount, setLastSyncedCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLastSynced(await getLastSyncTime());
      setLastSyncedCount(await getLastSyncCount());
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          query.clear();
          showToast('Logged out');
          navigation.getParent()?.replace('Auth');
        },
      },
    ]);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const stats = await syncBothWays();
      const now = new Date().toISOString();
      setLastSynced(now);
      setLastSyncedCount(stats?.total ?? 0);

      showToast(`Sync complete (${stats?.total ?? 0} items)`);
      Alert.alert('Sync Complete', `Synced ${stats?.total ?? 0} items successfully.`);
    } catch (e: any) {
      showToast('Sync failed');
      Alert.alert('Sync Failed', e?.message || String(e));
    }
    setSyncing(false);
  };

  const handleClearData = () => {
    Alert.alert('Clear Local Data', 'This will clear local data and return you to login.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearAllData();
          showToast('Local data cleared');
          navigation.getParent()?.replace('Auth');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* QUICK ACTIONS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => navigation.navigate('AccountManagementScreen')}
          >
            <MaterialIcon name="person" size={24} color="#2563EB" />
            <Text style={styles.actionText}>Account Management</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRow} onPress={handleLogout}>
            <MaterialIcon name="logout" size={24} color="#DC2626" />
            <Text style={styles.actionText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* SYNC DETAILS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backup & Sync</Text>

          <View style={styles.infoRow}>
            <MaterialIcon name="cloud-done" size={20} color="#475569" />
            <Text style={styles.infoText}>
              Last Synced:{' '}
              <Text style={styles.infoValue}>
                {lastSynced ? new Date(lastSynced).toLocaleString() : 'Never'}
              </Text>
            </Text>
          </View>

          <View style={styles.infoRow}>
            <MaterialIcon name="storage" size={20} color="#475569" />
            <Text style={styles.infoText}>
              Synced Items: <Text style={styles.infoValue}>{lastSyncedCount ?? '—'}</Text>
            </Text>
          </View>

          <Button
            title={syncing ? 'Syncing…' : 'Sync Now'}
            onPress={handleSync}
            loading={syncing}
            containerStyle={styles.btnContainer}
            buttonStyle={styles.primaryBtn}
            icon={<MaterialIcon name="sync" size={18} color="white" />}
          />
        </View>

        {/* OTHER OPTIONS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Danger Zone</Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleClearData}>
            <MaterialIcon name="delete-forever" size={24} color="#EA580C" />
            <Text style={styles.actionText}>Clear Local Data</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default SettingsScreen;

// -----------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },

  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
    color: '#1E293B',
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },

  actionText: {
    marginLeft: 14,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  infoText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#475569',
  },

  infoValue: {
    fontWeight: '700',
    color: '#1E293B',
  },

  btnContainer: {
    marginTop: 18,
  },

  primaryBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
  },
});
