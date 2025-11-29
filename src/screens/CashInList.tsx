import React, { useEffect } from 'react';
import { View, StyleSheet, FlatList, Dimensions } from 'react-native';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import TransactionCard from '../components/TransactionCard';
import { useNavigation } from '@react-navigation/native';
import useDelayedLoading from '../hooks/useDelayedLoading';
import FullScreenSpinner from '../components/FullScreenSpinner';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

const CashInList = () => {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { entries, deleteEntry, isLoading } = useEntries(user?.id);
  const showLoading = useDelayedLoading(Boolean(isLoading), 200);

  const inEntries = (entries || []).filter((e) => e.type === 'in');

  /** Fade animation */
  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, {
      duration: 450,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const animatedWrap = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 14 }],
  }));

  const handleEdit = (item: any) => {
    // Open edit in the History inline editor for consistency
    navigation.navigate('History', { edit_item: item });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEntry(id);
    } catch (err) {
      console.warn('Delete failed', err);
    }
  };

  return (
    <Animated.View style={[styles.container, animatedWrap]}>
      <FullScreenSpinner visible={showLoading} />
      {inEntries.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconContainer}>
            <MaterialIcon name="trending-up" size={font(40)} color="#16A34A" />
          </View>
          <Text style={styles.emptyTitle}>No Income Yet</Text>
          <Text style={styles.emptySubtitle}>When you add income, it will appear here.</Text>
          <Button
            title="Add First Income"
            onPress={() => navigation.navigate('AddEntry')}
            buttonStyle={styles.addBtn}
            titleStyle={styles.addBtnTitle}
            containerStyle={{ marginTop: 24 }}
          />
        </View>
      ) : (
        <FlatList
          data={inEntries}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => item.local_id}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
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

export default CashInList;

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
    backgroundColor: '#D1FAE5',
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
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  addBtnTitle: {
    fontSize: font(16),
    fontWeight: '600',
  },
});
