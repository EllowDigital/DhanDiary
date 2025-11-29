import React, { useEffect } from 'react';
import { View, StyleSheet, FlatList, Dimensions } from 'react-native';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import TransactionCard from '../components/TransactionCard';
import { useNavigation } from '@react-navigation/native';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

const CashOutList = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries, deleteEntry } = useEntries(user?.id);

  const outEntries = (entries || []).filter((e) => e.type === 'out');

  // fade in animation
  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, {
      duration: 450,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 18 }],
  }));

  const handleEdit = (item: any) => {
    // Open edit in the History inline editor for consistency
    navigation.navigate('History', { edit_local_id: item.local_id });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEntry(id);
    } catch (err) {
      console.warn('Delete error', err);
    }
  };

  return (
    <Animated.View style={[styles.container, animStyle]}>
      {outEntries.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconContainer}>
            <MaterialIcon name="trending-down" size={font(40)} color="#EF4444" />
          </View>
          <Text style={styles.emptyTitle}>No Expenses Yet</Text>
          <Text style={styles.emptySubtitle}>When you add an expense, it will appear here.</Text>
          <Button
            title="Add First Expense"
            onPress={() => navigation.navigate('AddEntry')}
            buttonStyle={styles.addBtn}
            titleStyle={styles.addBtnTitle}
            containerStyle={{ marginTop: 24 }}
          />
        </View>
      ) : (
        <FlatList
          data={outEntries}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 80, paddingTop: 10 }}
          keyExtractor={(item) => item.local_id}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={true}
          renderItem={({ item }) => (
            <TransactionCard
              item={item}
              onEdit={() => handleEdit(item)}
              onDelete={() => handleDelete(item.local_id)}
            />
          )}
        />
      )}
    </Animated.View>
  );
};

export default CashOutList;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: Math.round(16 * scale),
  },

  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
  emptyIconContainer: {
    width: font(80),
    height: font(80),
    borderRadius: font(40),
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: font(20),
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: font(15),
    color: '#64748B',
    textAlign: 'center',
    lineHeight: font(22),
  },
  addBtn: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  addBtnTitle: {
    fontSize: font(16),
    fontWeight: '600',
  },
});
