import React, { useMemo, useState, useCallback } from 'react';
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
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';

// --- CUSTOM IMPORTS (Assumed paths) ---
import ScreenHeader from '../components/ScreenHeader';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../utils/design';
import { exportToFile, shareFile } from '../utils/reportExporter';
import FullScreenSpinner from '../components/FullScreenSpinner';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// --- CONFIG ---
const FILTERS = ['Today', 'Daily', 'Weekly', 'Monthly', 'Custom', 'All'];
type Mode = 'Today' | 'Day' | 'Week' | 'Month' | 'Custom' | 'All';
type Format = 'pdf' | 'excel';

// --- UTILS ---
const fontScale = (size: number) => size / PixelRatio.getFontScale();

const getUnix = (dateInput: any): number => {
  if (dateInput === null || dateInput === undefined) return NaN;
  if (typeof dateInput === 'number') {
    // Accept seconds or milliseconds; normalize to seconds
    // If value looks like ms (greater than 1e12 ~ year 33658), treat as ms
    if (dateInput > 1e12) return Math.floor(dateInput / 1000);
    // If it's clearly milliseconds (>= 1e11 ~ year 5138), also divide
    if (dateInput > 1e11) return Math.floor(dateInput / 1000);
    return Math.floor(dateInput);
  }
  if (dateInput instanceof Date) return Math.floor(dateInput.getTime() / 1000);
  const d = new Date(dateInput);
  return Number.isFinite(d.getTime()) ? Math.floor(d.getTime() / 1000) : NaN;
};

// --- SUB-COMPONENTS ---

const SelectionChip = React.memo(
  ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  )
);

const FormatOption = React.memo(
  ({ type, active, onPress }: { type: Format; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.formatBtn, active && styles.formatBtnActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <MaterialIcon
        name={type === 'pdf' ? 'picture-as-pdf' : 'grid-view'}
        size={24}
        color={active ? colors.primary : '#94A3B8'}
      />
      <Text style={[styles.formatBtnText, active && styles.formatBtnTextActive]}>
        {type.toUpperCase()}
      </Text>
    </TouchableOpacity>
  )
);

const ExportScreen = () => {
  const { user } = useAuth();
  const { entries = [], refetch } = useEntries(user?.id);

  // --- STATE ---
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<Mode>('Month');
  const [pivotDate, setPivotDate] = useState(dayjs());

  // Custom Date Range
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());
  const [pickerMode, setPickerMode] = useState<'start' | 'end' | null>(null);

  // Options
  const [format, setFormat] = useState<Format>('pdf');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [groupBy, setGroupBy] = useState<'none' | 'category'>('category');

  // --- FILTERING ENGINE ---
  const { targetEntries, count } = useMemo(() => {
    if (!entries.length) return { targetEntries: [], count: 0 };

    let startUnix = -Infinity;
    let endUnix = Infinity;
    const now = dayjs();
    const pDate = pivotDate; // Reference to state

    switch (mode) {
      case 'Today':
        startUnix = now.startOf('day').unix();
        endUnix = now.endOf('day').unix();
        break;
      case 'Day':
        startUnix = pDate.startOf('day').unix();
        endUnix = pDate.endOf('day').unix();
        break;
      case 'Week':
        startUnix = pDate.startOf('week').unix();
        endUnix = pDate.endOf('week').unix();
        break;
      case 'Month':
        startUnix = pDate.startOf('month').unix();
        endUnix = pDate.endOf('month').unix();
        break;
      case 'Custom':
        startUnix = dayjs(customStart).startOf('day').unix();
        endUnix = dayjs(customEnd).endOf('day').unix();
        break;
      case 'All':
        // Default Infinity values work here
        break;
    }

    // Filter Loop (Optimized for speed)
    const filtered = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const t = getUnix(e.date || e.created_at);
      if (t >= startUnix && t <= endUnix) {
        filtered.push(e);
      }
    }

    return { targetEntries: filtered, count: filtered.length };
  }, [entries, mode, pivotDate, customStart, customEnd]);

  // --- HANDLERS ---
  const handleModeChange = useCallback((newMode: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    // Map UI labels to internal state keys
    let m: Mode = 'Month';
    if (newMode === 'Daily') m = 'Day';
    else if (newMode === 'Weekly') m = 'Week';
    else if (newMode === 'Monthly') m = 'Month';
    else m = newMode as Mode;

    setMode(m);
  }, []);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    const currentMode = pickerMode;
    setPickerMode(null); // Close picker immediately

    if (event.type === 'dismissed' || !selectedDate) return;

    if (currentMode === 'start') {
      if (selectedDate > customEnd) setCustomEnd(selectedDate); // Auto-adjust end
      setCustomStart(selectedDate);
    } else {
      if (selectedDate < customStart) setCustomStart(selectedDate); // Auto-adjust start
      setCustomEnd(selectedDate);
    }
  };

  const executeExport = () => {
    setExporting(true);
    // Defer heavy work to next tick to allow UI spinner to render
    InteractionManager.runAfterInteractions(async () => {
      try {
        // If online and Neon is configured, attempt a quick pull to ensure latest remote rows are present locally.
        try {
          const NetInfo = require('@react-native-community/netinfo');
          const net = await NetInfo.fetch();
          if (net.isConnected) {
            try {
              const pullMod = await import('../sync/pullFromNeon');
              await pullMod.default();
            } catch (e) {
              // fallback to full sync if pull fails silently
              try {
                const { syncBothWays } = await import('../services/syncManager');
                await syncBothWays();
              } catch (ee) { }
            }
            // Refresh local entries after pull
            try {
              await refetch?.();
            } catch (e) { }
          }
        } catch (e) { }

        const periodLabel =
          mode === 'All'
            ? 'All Time'
            : mode === 'Custom'
              ? `${dayjs(customStart).format('D MMM')} - ${dayjs(customEnd).format('D MMM')}`
              : getDateLabel();

        // Prepare Data: recompute targetEntries from the freshest `entries` snapshot.
        // This ensures we include any rows just pulled from remote.
        let source = entries || [];
        // try to use refetch result if available (react-query returns updated cache), otherwise use `entries`
        try {
          // no-op: entries should be refreshed by refetch awaited above
        } catch (e) { }

        let finalData = [] as any[];
        if (source && source.length > 0) {
          let startUnix = -Infinity;
          let endUnix = Infinity;
          const now = dayjs();
          const pDate = pivotDate;

          switch (mode) {
            case 'Today':
              startUnix = now.startOf('day').unix();
              endUnix = now.endOf('day').unix();
              break;
            case 'Day':
              startUnix = pDate.startOf('day').unix();
              endUnix = pDate.endOf('day').unix();
              break;
            case 'Week':
              startUnix = pDate.startOf('week').unix();
              endUnix = pDate.endOf('week').unix();
              break;
            case 'Month':
              startUnix = pDate.startOf('month').unix();
              endUnix = pDate.endOf('month').unix();
              break;
            case 'Custom':
              startUnix = dayjs(customStart).startOf('day').unix();
              endUnix = dayjs(customEnd).endOf('day').unix();
              break;
            case 'All':
            default:
              break;
          }

          for (let i = 0; i < source.length; i++) {
            const e = source[i] as any;
            const t = getUnix(e.date || e.created_at || e.createdAt || e.updated_at);
            if (!isNaN(t) && t >= startUnix && t <= endUnix) finalData.push(e);
          }
        }
        if (!includeNotes) {
          finalData = targetEntries.map(({ note, ...rest }: any) => rest);
        }

        // Generate File
        const filePath = await exportToFile(format, finalData, {
          title: `Report_${dayjs().format('YYYY-MM-DD')}`,
          periodLabel,
          groupBy: format === 'pdf' ? groupBy : 'none',
        });

        if (filePath) await shareFile(filePath);
        else throw new Error('Could not generate file path.');
      } catch (error: any) {
        Alert.alert('Export Failed', error.message || 'An unknown error occurred.');
      } finally {
        setExporting(false);
      }
    });
  };

  const handleExport = () => {
    if (count === 0) return;
    if (format === 'pdf' && count > 1000) {
      Alert.alert(
        'Large Dataset',
        `Generating a PDF with ${count} items may take a while. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: executeExport },
        ]
      );
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Fixed: ScreenHeader logic. 
        Assuming ScreenHeader handles the back button internally or via navigation. 
        Added paddingHorizontal to align with content if needed.
      */}
      <View style={styles.headerContainer}>
        <ScreenHeader
          title="Export Data"
          subtitle="Generate detailed financial reports"
          useSafeAreaPadding={false}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 1. SELECTION CARD */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>1. TIMEFRAME</Text>
            {count > 0 && <Text style={styles.countLabel}>{count} items found</Text>}
          </View>

          <View style={styles.chipGrid}>
            {FILTERS.map((f) => (
              <SelectionChip
                key={f}
                label={f}
                active={
                  mode ===
                  (f === 'Daily' ? 'Day' : f === 'Weekly' ? 'Week' : f === 'Monthly' ? 'Month' : f)
                }
                onPress={() => handleModeChange(f)}
              />
            ))}
          </View>

          {/* Navigation Controls for Day/Week/Month */}
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

          {/* Custom Date Pickers */}
          {mode === 'Custom' && (
            <View style={styles.customRow}>
              <TouchableOpacity style={styles.dateInput} onPress={() => setPickerMode('start')}>
                <Text style={styles.inputHint}>FROM</Text>
                <Text style={styles.inputText}>{dayjs(customStart).format('DD MMM YYYY')}</Text>
              </TouchableOpacity>

              <View style={styles.arrowContainer}>
                <MaterialIcon name="arrow-forward" size={20} color={colors.muted} />
              </View>

              <TouchableOpacity style={styles.dateInput} onPress={() => setPickerMode('end')}>
                <Text style={styles.inputHint}>TO</Text>
                <Text style={styles.inputText}>{dayjs(customEnd).format('DD MMM YYYY')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Status Box */}
          <View style={[styles.infoBox, { backgroundColor: count > 0 ? '#F0FDF4' : '#FEF2F2' }]}>
            <MaterialIcon
              name={count > 0 ? 'check-circle' : 'info'}
              size={18}
              color={count > 0 ? '#166534' : '#991B1B'}
            />
            <Text style={[styles.infoText, { color: count > 0 ? '#166534' : '#991B1B' }]}>
              {count > 0
                ? `Ready to export ${count} transactions.`
                : 'No transactions found in this period.'}
            </Text>
          </View>
        </View>

        {/* 2. FORMAT CARD */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>2. FORMAT</Text>
          <View style={styles.formatRow}>
            {(['pdf', 'excel'] as Format[]).map((f) => (
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
              <Text style={styles.checkText}>Include notes</Text>
            </TouchableOpacity>

            {format === 'pdf' && (
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
                <Text style={styles.checkText}>Group by category</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={{ height: 20 }} />

        {/* 3. MAIN ACTION BUTTON */}
        <Button
          title={exporting ? 'Generating...' : count === 0 ? 'No Data to Export' : 'Export & Share'}
          disabled={count === 0 || exporting}
          buttonStyle={styles.exportBtn}
          titleStyle={styles.exportBtnTitle}
          disabledStyle={styles.exportBtnDisabled}
          disabledTitleStyle={styles.exportBtnTitleDisabled}
          icon={
            count > 0 && !exporting ? (
              <MaterialIcon name="share" size={20} color="white" style={{ marginRight: 8 }} />
            ) : undefined
          }
          onPress={handleExport}
        />

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Date Picker Modal (Platform Specific) */}
      {pickerMode && (
        <DateTimePicker
          value={pickerMode === 'start' ? customStart : customEnd}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date('2000-01-01')}
          maximumDate={new Date()}
        />
      )}

      {/* Loading Overlay */}
      <FullScreenSpinner visible={exporting} message="Creating Report..." />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  headerContainer: {
    paddingHorizontal: 16, // Ensure alignment with content
    paddingBottom: 8,
  },
  scrollContent: { padding: 16 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#64748B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: { fontSize: fontScale(12), fontWeight: '800', color: '#94A3B8', letterSpacing: 1 },
  countLabel: { fontSize: fontScale(12), fontWeight: '700', color: colors.primary },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
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
    padding: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  navBtn: { padding: 10, backgroundColor: '#fff', borderRadius: 12, elevation: 1 },
  navLabel: { fontSize: fontScale(14), fontWeight: '700', color: '#334155' },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  dateInput: {
    flex: 1,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputHint: { fontSize: fontScale(10), fontWeight: '800', color: '#94A3B8', marginBottom: 4 },
  inputText: { fontSize: fontScale(14), fontWeight: '700', color: '#1E293B' },
  arrowContainer: { justifyContent: 'center', paddingTop: 10 },

  infoBox: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, gap: 8 },
  infoText: { fontSize: fontScale(12), fontWeight: '600', flex: 1 },

  formatRow: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 20 },
  formatBtn: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  formatBtnActive: { borderColor: colors.primary, backgroundColor: '#F0F9FF', borderWidth: 1.5 },
  formatBtnText: { fontSize: fontScale(11), fontWeight: '800', color: '#94A3B8', marginTop: 8 },
  formatBtnTextActive: { color: colors.primary },

  optionsContainer: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16, gap: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkText: { fontSize: fontScale(14), fontWeight: '500', color: '#334155' },

  exportBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 16,
    elevation: 5,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  exportBtnTitle: {
    fontSize: fontScale(16),
    fontWeight: '700',
    color: '#FFF',
  },
  exportBtnDisabled: {
    backgroundColor: '#E2E8F0',
    elevation: 0,
  },
  exportBtnTitleDisabled: {
    color: '#94A3B8',
  },
});

export default ExportScreen;
