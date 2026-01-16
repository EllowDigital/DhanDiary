import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  LayoutAnimation,
  InteractionManager,
  PixelRatio,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';

// --- CUSTOM IMPORTS ---
import ScreenHeader from '../components/ScreenHeader';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../utils/design';
import { exportToFile, shareFile } from '../utils/reportExporter';
import FullScreenSpinner from '../components/FullScreenSpinner';
import { enableLegacyLayoutAnimations } from '../utils/layoutAnimation';

enableLegacyLayoutAnimations();

// --- TYPES & CONFIG ---
const FILTERS = ['Today', 'Daily', 'Weekly', 'Monthly', 'Custom', 'All'] as const;
type FilterLabel = (typeof FILTERS)[number];
type InternalMode = 'Today' | 'Day' | 'Week' | 'Month' | 'Custom' | 'All';
type ExportFormat = 'pdf' | 'excel' | 'csv' | 'json';

// --- UTILS ---
const fontScale = (size: number) => size / PixelRatio.getFontScale();

// Robust Unix timestamp extractor
const getUnix = (dateInput: any): number => {
  if (dateInput === null || dateInput === undefined) return NaN;
  if (typeof dateInput === 'number') {
    // If > year 3000 in seconds (approx), treat as ms
    if (dateInput > 32503680000) return Math.floor(dateInput / 1000);
    return Math.floor(dateInput);
  }
  if (dateInput instanceof Date) return Math.floor(dateInput.getTime() / 1000);

  // Try parsing string
  const d = new Date(dateInput);
  const t = d.getTime();
  return Number.isFinite(t) ? Math.floor(t / 1000) : NaN;
};

// --- SUB-COMPONENTS ---

const SelectionChip = React.memo(
  ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
);

const FormatOption = React.memo(
  ({ type, active, onPress }: { type: ExportFormat; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.formatBtn, active && styles.formatBtnActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <MaterialIcon
        name={
          type === 'pdf'
            ? 'picture-as-pdf'
            : type === 'excel'
              ? 'grid-view'
              : type === 'json'
                ? 'code'
                : 'file-download'
        }
        size={28}
        color={active ? colors.primary : '#94A3B8'}
      />
      <Text style={[styles.formatBtnText, active && styles.formatBtnTextActive]}>
        {type.toUpperCase()}
      </Text>
      {active && (
        <View style={styles.checkBadge}>
          <MaterialIcon name="check" size={12} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  )
);

const ExportScreen = () => {
  const { user } = useAuth();

  // Export must work offline even when Clerk user isn't available yet.
  const [resolvedUserId, setResolvedUserId] = useState<string | undefined>(user?.id);

  useEffect(() => {
    let mounted = true;
    if (user?.id) {
      setResolvedUserId(user.id);
      return;
    }

    (async () => {
      try {
        const s = await import('../db/session');
        const sess = await s.getSession?.();
        const id = sess?.id;
        if (mounted && id) {
          setResolvedUserId(id);
          return;
        }
      } catch (e) {}

      try {
        const t = await import('../db/transactions');
        const anyId = await t.getAnyUserWithTransactions?.();
        if (mounted && anyId) setResolvedUserId(anyId);
      } catch (e) {}
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const { entries = [], refetch } = useEntries(resolvedUserId);

  // --- STATE ---
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<InternalMode>('Month');
  const [pivotDate, setPivotDate] = useState(dayjs());

  // Custom Date Range
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'start' | 'end' | null>(null);

  // Options
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [groupBy, setGroupBy] = useState<'none' | 'category'>('category');

  // --- FILTERING ENGINE ---
  const entriesWithUnix = useMemo(() => {
    if (!entries.length) return [] as Array<{ e: any; t: number }>;
    const out: Array<{ e: any; t: number }> = new Array(entries.length);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i] as any;
      const t = getUnix(e?.date || e?.created_at || e?.updated_at);
      out[i] = { e, t };
    }
    return out;
  }, [entries]);

  const { targetEntries, count } = useMemo(() => {
    if (!entriesWithUnix.length) return { targetEntries: [], count: 0 };

    let startUnix = -Infinity;
    let endUnix = Infinity;

    const p = pivotDate; // dayjs object

    switch (mode) {
      case 'Today': {
        const now = dayjs();
        startUnix = now.startOf('day').unix();
        endUnix = now.endOf('day').unix();
        break;
      }
      case 'Day':
        startUnix = p.startOf('day').unix();
        endUnix = p.endOf('day').unix();
        break;
      case 'Week':
        startUnix = p.startOf('week').unix();
        endUnix = p.endOf('week').unix();
        break;
      case 'Month':
        startUnix = p.startOf('month').unix();
        endUnix = p.endOf('month').unix();
        break;
      case 'Custom':
        startUnix = dayjs(customStart).startOf('day').unix();
        endUnix = dayjs(customEnd).endOf('day').unix();
        break;
      case 'All':
      default:
        break;
    }

    const filtered: any[] = [];
    for (let i = 0; i < entriesWithUnix.length; i++) {
      const { e, t } = entriesWithUnix[i];
      if (!Number.isFinite(t)) {
        if (mode === 'All') filtered.push(e);
        continue;
      }
      if (t >= startUnix && t <= endUnix) {
        filtered.push(e);
      }
    }

    return { targetEntries: filtered, count: filtered.length };
  }, [entriesWithUnix, mode, pivotDate, customStart, customEnd]);

  // --- HANDLERS ---

  const handleModeChange = useCallback((label: FilterLabel) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    let newMode: InternalMode = 'Month';
    if (label === 'Daily') newMode = 'Day';
    else if (label === 'Weekly') newMode = 'Week';
    else if (label === 'Monthly') newMode = 'Month';
    else newMode = label as InternalMode;

    setMode(newMode);

    if (newMode === 'Today' || newMode === 'All') {
      setPivotDate(dayjs());
    }
  }, []);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    const currentMode = pickerMode;
    if (Platform.OS === 'android') setPickerMode(null);

    if (event.type === 'dismissed' || !selectedDate) {
      setPickerMode(null);
      return;
    }

    if (currentMode === 'start') {
      if (selectedDate > customEnd) setCustomEnd(selectedDate);
      setCustomStart(selectedDate);
    } else {
      if (selectedDate < customStart) setCustomStart(selectedDate);
      setCustomEnd(selectedDate);
    }

    setPickerMode(null);
  };

  const executeExport = async () => {
    setExporting(true);

    await new Promise<void>((resolve) => InteractionManager.runAfterInteractions(() => resolve()));

    try {
      try {
        const NetInfo = require('@react-native-community/netinfo');
        const net = await NetInfo.fetch();
        if (net.isConnected) {
          const pullMod = await import('../sync/pullFromNeon');
          const didPull = await Promise.race<boolean>([
            Promise.resolve()
              .then(() => pullMod.default())
              .then(() => true)
              .catch(() => false),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3500)),
          ]);
          if (didPull) await refetch?.();
        }
      } catch (e) {
        // Continue with local data if sync fails
      }

      const finalData = includeNotes
        ? (targetEntries as any[])
        : (targetEntries as any[]).map(({ note, ...rest }: any) => rest);

      const periodLabel =
        mode === 'All'
          ? 'All Time'
          : mode === 'Custom'
            ? `${dayjs(customStart).format('D MMM')} - ${dayjs(customEnd).format('D MMM')}`
            : getDateLabel();

      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const filePath = await exportToFile(format, finalData, {
        title: `Report_${dayjs().format('YYYY-MM-DD')}`,
        periodLabel,
        groupBy: format === 'pdf' || format === 'excel' ? groupBy : 'none',
      });

      if (filePath) {
        await shareFile(filePath);
      } else {
        throw new Error('File generation failed');
      }
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPress = () => {
    if (count === 0) return;
    if (format === 'pdf' && count > 800) {
      Alert.alert('Large Report', `Generating a PDF with ${count} items may be slow. Continue?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: executeExport },
      ]);
      return;
    }
    executeExport();
  };

  const getDateLabel = () => {
    if (mode === 'Day') return pivotDate.format('DD MMM YYYY');
    if (mode === 'Month') return pivotDate.format('MMMM YYYY');
    if (mode === 'Week')
      return `${pivotDate.startOf('week').format('D MMM')} - ${pivotDate.endOf('week').format('D MMM')}`;
    return '';
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right'] as any}>
      <View style={styles.headerContainer}>
        <ScreenHeader
          title="Export Data"
          subtitle="Generate financial reports"
          showScrollHint={false}
          useSafeAreaPadding={false}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* --- CARD 1: TIMEFRAME --- */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepText}>1</Text>
              </View>
              <Text style={styles.cardTitle}>TIMEFRAME</Text>
            </View>
            {count > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countLabel}>{count} items</Text>
              </View>
            )}
          </View>

          <View style={styles.chipGrid}>
            {FILTERS.map((f) => {
              let isActive = false;
              if (f === 'Daily' && mode === 'Day') isActive = true;
              else if (f === 'Weekly' && mode === 'Week') isActive = true;
              else if (f === 'Monthly' && mode === 'Month') isActive = true;
              else if (f === mode) isActive = true;

              return (
                <SelectionChip
                  key={f}
                  label={f}
                  active={isActive}
                  onPress={() => handleModeChange(f)}
                />
              );
            })}
          </View>

          {['Day', 'Week', 'Month'].includes(mode) && (
            <View style={styles.navRow}>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => setPivotDate(pivotDate.subtract(1, mode.toLowerCase() as any))}
              >
                <MaterialIcon name="chevron-left" size={26} color={colors.primary} />
              </TouchableOpacity>

              <Text style={styles.navLabel}>{getDateLabel()}</Text>

              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => setPivotDate(pivotDate.add(1, mode.toLowerCase() as any))}
              >
                <MaterialIcon name="chevron-right" size={26} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {mode === 'Custom' && (
            <View style={styles.customRow}>
              <TouchableOpacity style={styles.dateInput} onPress={() => setPickerMode('start')}>
                <Text style={styles.inputHint}>FROM</Text>
                <Text style={styles.inputText}>{dayjs(customStart).format('DD MMM YYYY')}</Text>
                <MaterialIcon
                  name="calendar-today"
                  size={16}
                  color={colors.primary}
                  style={styles.calIcon}
                />
              </TouchableOpacity>

              <MaterialIcon name="arrow-forward" size={20} color="#CBD5E1" />

              <TouchableOpacity style={styles.dateInput} onPress={() => setPickerMode('end')}>
                <Text style={styles.inputHint}>TO</Text>
                <Text style={styles.inputText}>{dayjs(customEnd).format('DD MMM YYYY')}</Text>
                <MaterialIcon
                  name="calendar-today"
                  size={16}
                  color={colors.primary}
                  style={styles.calIcon}
                />
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.infoBox, { backgroundColor: count > 0 ? '#F0FDF4' : '#FEF2F2' }]}>
            <MaterialIcon
              name={count > 0 ? 'check-circle' : 'info'}
              size={20}
              color={count > 0 ? '#166534' : '#991B1B'}
            />
            <Text style={[styles.infoText, { color: count > 0 ? '#166534' : '#991B1B' }]}>
              {count > 0
                ? `Ready to export ${count} transactions.`
                : 'No transactions found for this period.'}
            </Text>
          </View>
        </View>

        {/* --- CARD 2: FORMAT --- */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepText}>2</Text>
            </View>
            <Text style={styles.cardTitle}>FORMAT</Text>
          </View>

          <View style={styles.formatRow}>
            {(['pdf', 'excel', 'csv'] as const).map((f) => (
              <FormatOption key={f} type={f} active={format === f} onPress={() => setFormat(f)} />
            ))}
          </View>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setIncludeNotes(!includeNotes)}
              activeOpacity={0.7}
            >
              <MaterialIcon
                name={includeNotes ? 'check-box' : 'check-box-outline-blank'}
                size={24}
                color={colors.primary}
              />
              <Text style={styles.checkText}>Include descriptions/notes</Text>
            </TouchableOpacity>

            {(format === 'pdf' || format === 'excel') && (
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => setGroupBy(groupBy === 'category' ? 'none' : 'category')}
                activeOpacity={0.7}
              >
                <MaterialIcon
                  name={groupBy === 'category' ? 'check-box' : 'check-box-outline-blank'}
                  size={24}
                  color={colors.primary}
                />
                <Text style={styles.checkText}>Group items by category</Text>
              </TouchableOpacity>
            )}

            {format === 'excel' && groupBy === 'category' && (
              <Text style={styles.helperNote}>
                Excel will include an extra “Summary” sheet with Category / Income / Expense / Net.
              </Text>
            )}
          </View>
        </View>

        <View style={{ height: 12 }} />

        {/* --- ACTION BUTTON --- */}
        <Button
          title={
            exporting
              ? 'Generating Report...'
              : count === 0
                ? 'No Data Available'
                : 'Export & Share'
          }
          disabled={count === 0 || exporting}
          loading={exporting}
          buttonStyle={styles.exportBtn}
          titleStyle={styles.exportBtnTitle}
          disabledStyle={styles.exportBtnDisabled}
          disabledTitleStyle={styles.exportBtnTitleDisabled}
          icon={
            !exporting && count > 0 ? (
              <MaterialIcon name="ios-share" size={20} color="white" style={{ marginRight: 8 }} />
            ) : undefined
          }
          onPress={handleExportPress}
        />

        <View style={{ height: 60 }} />
      </ScrollView>

      {pickerMode && (
        <DateTimePicker
          value={pickerMode === 'start' ? customStart : customEnd}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date('2020-01-01')}
          maximumDate={new Date()}
        />
      )}

      <FullScreenSpinner visible={exporting} message="Creating Report..." />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  headerContainer: { paddingHorizontal: 16, paddingBottom: 8 },
  scrollContent: { padding: 16 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: fontScale(13), fontWeight: '800', color: '#64748B', letterSpacing: 0.5 },

  stepBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  stepText: { fontSize: 10, fontWeight: '800', color: '#64748B' },

  countBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countLabel: { fontSize: fontScale(12), fontWeight: '700', color: colors.primary },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontScale(12), fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#fff' },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 16,
    marginBottom: 12,
  },
  navBtn: { padding: 8, backgroundColor: '#fff', borderRadius: 12, elevation: 1 },
  navLabel: { fontSize: fontScale(14), fontWeight: '700', color: '#334155' },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dateInput: {
    flex: 1,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  inputHint: { fontSize: fontScale(10), fontWeight: '800', color: '#94A3B8', marginBottom: 2 },
  inputText: { fontSize: fontScale(13), fontWeight: '700', color: '#1E293B' },
  calIcon: { position: 'absolute', right: 12, top: 16, opacity: 0.5 },

  infoBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, gap: 10 },
  infoText: { fontSize: fontScale(12), fontWeight: '600', flex: 1 },

  formatRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  formatBtn: {
    flex: 1,
    alignItems: 'center',
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    position: 'relative',
  },
  formatBtnActive: { borderColor: colors.primary, backgroundColor: '#EFF6FF', borderWidth: 2 },
  formatBtnText: { fontSize: fontScale(12), fontWeight: '800', color: '#94A3B8', marginTop: 10 },
  formatBtnTextActive: { color: colors.primary },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.primary,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  optionsContainer: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16, gap: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkText: { fontSize: fontScale(13), fontWeight: '600', color: '#475569' },
  helperNote: { fontSize: fontScale(12), fontWeight: '600', color: '#64748B', marginTop: 2 },

  exportBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 18,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  exportBtnTitle: {
    fontSize: fontScale(16),
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  exportBtnDisabled: {
    backgroundColor: '#E2E8F0',
    elevation: 0,
    shadowOpacity: 0,
  },
  exportBtnTitleDisabled: {
    color: '#94A3B8',
  },
});

export default ExportScreen;
