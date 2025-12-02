// src/screens/AddEntryScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Input, Button, Text } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useEntries } from '../hooks/useEntries';
import { useToast } from '../context/ToastContext';
import runInBackground from '../utils/background';
import CategoryPickerModal from '../components/CategoryPickerModal';
import { v4 as uuidv4 } from 'uuid';
import { colors } from '../utils/design';

import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = SCREEN_WIDTH / 390;
const font = (s: number) => Math.round(s * scale);

const quickCategories = ['Food', 'Transport', 'Bills', 'Salary', 'Shopping', 'Health', 'Other'];

const typeConfigs = [
  {
    label: 'Cash Out',
    subtitle: 'Expenses & payouts',
    accent: colors.accentRed,
    accentSoft: colors.accentRedSoft,
    icon: 'trending-down',
  },
  {
    label: 'Cash In',
    subtitle: 'Income & refunds',
    accent: colors.accentGreen,
    accentSoft: colors.accentGreenSoft,
    icon: 'trending-up',
  },
];

const AddEntryScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const editingParamId = route?.params?.local_id;

  const { addEntry, entries, updateEntry } = useEntries();

  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [typeIndex, setTypeIndex] = useState(0);
  const [category, setCategory] = useState('General');
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);

  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [segmentWidth, setSegmentWidth] = useState(0);

  const types: ('out' | 'in')[] = ['out', 'in'];
  const typeMeta = typeConfigs[typeIndex];
  const noteLength = note.trim().length;

  useEffect(() => {
    if (editingParamId && entries) {
      const found = entries.find((e: any) => e.local_id === editingParamId);
      if (found) {
        setAmount(String(found.amount ?? ''));
        setNote(found.note ?? '');
        setTypeIndex(found.type === 'in' ? 1 : 0);
        setCategory(found.category ?? 'General');
        const fallback = found.date ?? found.created_at ?? found.updated_at;
        setDate(fallback ? new Date(fallback) : new Date());
        setEditingLocalId(found.local_id);
      }
    }
  }, [editingParamId, entries]);

  const onPickCategory = (c: string) => {
    setCategory(c);
    setCategoryModalVisible(false);
  };

  const parseAmount = () => {
    const parsed = parseFloat(amount.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const { showToast } = useToast();

  const handleSave = () => {
    const parsed = parseAmount();
    if (!amount.trim() || isNaN(parsed) || parsed <= 0) {
      return Alert.alert('Validation', 'Please enter a valid amount.');
    }

    // Prepare payload
    const payload = {
      amount: parsed,
      type: types[typeIndex],
      category,
      note,
      currency: 'INR',
      date: date.toISOString(),
    };

    // Optimistic UX: navigate back immediately and run work in background
    showToast(editingLocalId ? 'Updating...' : 'Saving...');
    navigation.goBack();

    runInBackground(async () => {
      try {
        if (editingLocalId) {
          await updateEntry({ local_id: editingLocalId, updates: payload });
          showToast('Updated');
        } else {
          await addEntry({ local_id: uuidv4(), ...payload });
          showToast('Saved');
        }
      } catch (err: any) {
        // If background save fails, inform user
        showToast(err?.message || 'Save failed');
      }
    });
  };

  // CARD ANIMATION
  const scaleValue = useSharedValue(1);
  const shadowValue = useSharedValue(5);
  const segmentProgress = useSharedValue(0);
  const amountFocusProgress = useSharedValue(0);

  const onPressInCard = () => {
    scaleValue.value = withSpring(1.02);
    shadowValue.value = withTiming(14);
  };
  const onPressOutCard = () => {
    scaleValue.value = withSpring(1);
    shadowValue.value = withTiming(5);
  };

  useEffect(() => {
    segmentProgress.value = withTiming(typeIndex, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [typeIndex, segmentProgress]);

  const handleAmountFocus = () => {
    amountFocusProgress.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
  };

  const handleAmountBlur = () => {
    amountFocusProgress.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
  };

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleValue.value + amountFocusProgress.value * 0.01 }],
    elevation: shadowValue.value,
    shadowRadius: shadowValue.value + amountFocusProgress.value * 6,
    shadowOpacity: 0.08 + amountFocusProgress.value * 0.15,
  }));

  const indicatorStyle = useAnimatedStyle(() => {
    if (!segmentWidth) return { opacity: 0 };
    const buttonWidth = (segmentWidth - 12) / 2;
    const translateX = segmentProgress.value * (buttonWidth + 6);
    return {
      opacity: 1,
      width: buttonWidth,
      transform: [{ translateX }],
    };
  });

  const subtitleLabel = editingLocalId
    ? 'Update or adjust an existing movement'
    : 'Log new income or expense in seconds';

  const handleSegmentLayout = useCallback((event: any) => {
    setSegmentWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>
            {editingLocalId ? 'Edit Transaction' : 'Add Transaction'}
          </Text>
          <Text style={styles.subtitle}>{subtitleLabel}</Text>

          <Animated.View
            entering={FadeInDown.delay(40).springify().damping(14)}
            style={styles.segmentWrapper}
            onLayout={handleSegmentLayout}
          >
            <Animated.View style={[styles.segmentIndicator, indicatorStyle]} />
            {typeConfigs.map((cfg, idx) => {
              const active = typeIndex === idx;
              return (
                <Pressable
                  key={cfg.label}
                  style={styles.segmentButton}
                  onPress={() => setTypeIndex(idx)}
                >
                  <View style={styles.segmentContent}>
                    <View
                      style={[
                        styles.segmentIcon,
                        { backgroundColor: active ? cfg.accent : colors.card },
                      ]}
                    >
                      <MaterialIcon
                        name={cfg.icon as any}
                        size={18}
                        color={active ? colors.white : cfg.accent}
                      />
                    </View>
                    <View>
                      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                        {cfg.label}
                      </Text>
                      <Text style={styles.segmentSubtitle}>{cfg.subtitle}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>

          <Pressable onPressIn={onPressInCard} onPressOut={onPressOutCard}>
            <Animated.View
              entering={FadeInDown.delay(120).springify().damping(14)}
              style={[
                styles.cardWrapper,
                { borderColor: `${typeMeta.accent}33` },
                animatedCardStyle,
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Amount</Text>
                <View style={[styles.typeBadge, { backgroundColor: typeMeta.accentSoft }]}>
                  <MaterialIcon name={typeMeta.icon as any} size={16} color={typeMeta.accent} />
                  <Text style={[styles.typeBadgeText, { color: typeMeta.accent }]}>
                    {typeMeta.label}
                  </Text>
                </View>
              </View>

              <View style={styles.amountRow}>
                <Text style={[styles.currency, { color: typeMeta.accent }]}>₹</Text>
                <Input
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                  onFocus={handleAmountFocus}
                  onBlur={handleAmountBlur}
                  containerStyle={{ flex: 1, paddingLeft: 0 }}
                  inputContainerStyle={{ borderBottomWidth: 0 }}
                  inputStyle={styles.amountInput}
                />
              </View>
              <Text style={styles.cardHint}>{typeMeta.subtitle}</Text>
            </Animated.View>
          </Pressable>

          <Animated.View entering={FadeInDown.delay(200).springify().damping(14)}>
            <View style={styles.dualRow}>
              <Pressable style={styles.infoTile} onPress={() => setCategoryModalVisible(true)}>
                <View style={styles.infoLabelRow}>
                  <MaterialIcon name="category" size={20} color={colors.subtleText} />
                  <Text style={styles.infoLabel}>Category</Text>
                </View>
                <View style={styles.infoValueRow}>
                  <Text style={styles.infoValue}>{category}</Text>
                  <MaterialIcon name="chevron-right" size={20} color={colors.mutedSoft} />
                </View>
              </Pressable>

              <Pressable style={styles.infoTile} onPress={() => setShowDatePicker(true)}>
                <View style={styles.infoLabelRow}>
                  <MaterialIcon name="event" size={20} color={colors.subtleText} />
                  <Text style={styles.infoLabel}>Date</Text>
                </View>
                <View style={styles.infoValueRow}>
                  <Text style={styles.infoValue}>{date.toDateString()}</Text>
                  <MaterialIcon name="chevron-right" size={20} color={colors.mutedSoft} />
                </View>
              </Pressable>
            </View>
          </Animated.View>

          {showDatePicker && (
            <DateTimePicker
              value={date}
              mode="date"
              display="default"
              onChange={(e, d) => {
                setShowDatePicker(false);
                if (d) setDate(d);
              }}
            />
          )}

          <Animated.View entering={FadeInDown.delay(280).springify().damping(14)}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Quick categories</Text>
              <Text style={styles.sectionHint}>Tap to autofill</Text>
            </View>
            <View style={styles.chipRow}>
              {quickCategories.map((item) => {
                const active = category === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.chip, active && { backgroundColor: typeMeta.accentSoft }]}
                    onPress={() => setCategory(item)}
                  >
                    <Text style={[styles.chipText, active && { color: typeMeta.accent }]}>
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(360).springify().damping(14)}
            style={styles.noteCard}
          >
            <View style={styles.noteHeader}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.sectionHint}>{noteLength}/160</Text>
            </View>
            <Input
              placeholder="Add a short note (optional)"
              value={note}
              onChangeText={(text) => setNote(text.slice(0, 160))}
              multiline
              numberOfLines={3}
              inputContainerStyle={styles.noteInput}
              inputStyle={styles.noteText}
              placeholderTextColor={colors.mutedSoft}
            />
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(420).springify().damping(12)}>
            <Button
              title={editingLocalId ? 'Update Transaction' : 'Save Transaction'}
              onPress={handleSave}
              buttonStyle={[styles.saveButton, { backgroundColor: typeMeta.accent }]}
              titleStyle={styles.saveButtonTitle}
            />
          </Animated.View>

          <CategoryPickerModal
            visible={categoryModalVisible}
            onClose={() => setCategoryModalVisible(false)}
            onSelect={onPickCategory}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default AddEntryScreen;

/* ------------------------------------
   MODERN RESPONSIVE STYLES
------------------------------------ */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 60,
    backgroundColor: colors.background,
  },
  title: {
    textAlign: 'center',
    fontSize: font(24),
    fontWeight: '700',
    marginBottom: 4,
    color: colors.text,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.muted,
    marginBottom: 18,
    fontSize: font(14),
  },
  segmentWrapper: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 22,
    padding: 6,
    marginBottom: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 6,
    borderRadius: 16,
    backgroundColor: colors.card,
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  segmentLabel: {
    fontSize: font(15),
    fontWeight: '600',
    color: colors.muted,
  },
  segmentLabelActive: {
    color: colors.text,
  },
  segmentSubtitle: {
    fontSize: font(12),
    color: colors.mutedSoft,
  },
  cardWrapper: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: font(15),
    fontWeight: '600',
    color: colors.subtleText,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  typeBadgeText: {
    fontSize: font(12),
    fontWeight: '600',
    marginLeft: 6,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  currency: {
    fontSize: font(34),
    fontWeight: '800',
    marginRight: 8,
  },
  amountInput: {
    fontSize: font(40),
    fontWeight: '800',
    color: colors.text,
  },
  cardHint: {
    marginTop: 4,
    color: colors.mutedSoft,
    fontSize: font(12),
  },
  dualRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  infoTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: font(13),
    fontWeight: '600',
    color: colors.muted,
    marginLeft: 8,
  },
  infoValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoValue: {
    fontSize: font(16),
    fontWeight: '700',
    color: colors.text,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: font(15),
    fontWeight: '700',
    color: colors.text,
  },
  sectionHint: {
    fontSize: font(12),
    color: colors.mutedSoft,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginRight: 10,
    marginBottom: 10,
  },
  chipText: {
    fontSize: font(13),
    fontWeight: '600',
    color: colors.subtleText,
  },
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 26,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  noteInput: {
    borderBottomWidth: 0,
    paddingTop: 4,
  },
  noteText: {
    fontSize: font(14),
    color: colors.text,
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 16,
  },
  saveButtonTitle: {
    fontSize: font(16),
    fontWeight: '700',
  },
});
