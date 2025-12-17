import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  TouchableOpacity,
  UIManager,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import ScreenHeader from '../components/ScreenHeader';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../utils/design';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { exportToFile, shareFile } from '../utils/reportExporter';
import DateTimePicker from '@react-native-community/datetimepicker';
import FullScreenSpinner from '../components/FullScreenSpinner';
import dayjs from 'dayjs';

// Setup Android Layout Animations
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Mode = 'Today' | 'Day' | 'Week' | 'Month' | 'Custom' | 'All';

const ExportScreen = () => {
  const { user } = useAuth();
  const { entries = [] } = useEntries(user?.uid);

  // --- STATE ---
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<Mode>('Month');
  const [pivotDate, setPivotDate] = useState(dayjs());
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [format, setFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'date'>('date');

  // --- OPTIMIZED FILTERING ENGINE ---
  // Using Unix Timestamps for O(n) filtering with zero dayjs object overhead inside the loop
  const { targetEntries, count } = useMemo(() => {
    if (!entries.length) return { targetEntries: [], count: 0 };

    let startUnix = -Infinity;
    let endUnix = Infinity;

    const now = dayjs();
    if (mode === 'Today') {
      startUnix = now.startOf('day').unix();
      endUnix = now.endOf('day').unix();
    } else if (mode === 'Day') {
      startUnix = pivotDate.startOf('day').unix();
      endUnix = pivotDate.endOf('day').unix();
    } else if (mode === 'Week') {
      startUnix = pivotDate.startOf('week').unix();
      endUnix = pivotDate.endOf('week').unix();
    } else if (mode === 'Month') {
      startUnix = pivotDate.startOf('month').unix();
      endUnix = pivotDate.endOf('month').unix();
    } else if (mode === 'Custom') {
      startUnix = dayjs(customStart).startOf('day').unix();
      endUnix = dayjs(customEnd).endOf('day').unix();
    }

    if (mode === 'All') return { targetEntries: entries, count: entries.length };

    // Fast Numeric Filter
    const filtered = [];
    for (let i = 0; i < entries.length; i++) {
      const item = entries[i];
      const ts = dayjs(item.date || item.created_at).unix();
      if (ts >= startUnix && ts <= endUnix) {
        filtered.push(item);
      }
    }

    return { targetEntries: filtered, count: filtered.length };
  }, [entries, mode, pivotDate, customStart, customEnd]);

  // --- HELPERS ---
  const dateLabel = useMemo(() => {
    if (mode === 'Day') return pivotDate.format('DD MMM YYYY');
    if (mode === 'Month') return pivotDate.format('MMMM YYYY');
    if (mode === 'Week') {
      return `${pivotDate.startOf('week').format('DD MMM')} - ${pivotDate.endOf('week').format('DD MMM')}`;
    }
    return '';
  }, [mode, pivotDate]);

  const handleExport = async () => {
    if (count === 0) {
      return Alert.alert('No Data', 'No transactions found for the selected range.');
    }

    setExporting(true);
    // Use timeout to allow UI spinner to render before blocking thread
    setTimeout(async () => {
      try {
        const periodLabel = mode === 'All' ? 'All Time' : (mode === 'Custom' ? 'Custom Range' : dateLabel);
        
        // Final map to exclude notes if needed (yields per 500 items to keep UI responsive)
        let dataToProcess = targetEntries;
        if (!includeNotes) {
          dataToProcess = targetEntries.map(({ note, ...rest }: any) => rest);
        }

        const filePath = await exportToFile(format, dataToProcess, {
          title: `Report_${dayjs().format('YYYYMMDD')}`,
          periodLabel,
          groupBy,
        });

        if (filePath) await shareFile(filePath);
      } catch (error: any) {
        Alert.alert('Export Error', error.message);
      } finally {
        setExporting(false);
      }
    }, 100);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader title="Export Data" subtitle="Generate detailed financial reports" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* 1. RANGE SELECTION */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Select Timeframe</Text>
          <View style={styles.chipGrid}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.chip, mode === (f === 'Daily' ? 'Day' : f === 'Weekly' ? 'Week' : f === 'Monthly' ? 'Month' : f) && styles.chipActive]}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setMode((f === 'Daily' ? 'Day' : f === 'Weekly' ? 'Week' : f === 'Monthly' ? 'Month' : f) as Mode);
                }}
              >
                <Text style={[styles.chipText, mode === (f === 'Daily' ? 'Day' : f === 'Weekly' ? 'Week' : f === 'Monthly' ? 'Month' : f) && styles.chipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {['Day', 'Week', 'Month'].includes(mode) && (
            <View style={styles.navRow}>
              <TouchableOpacity onPress={() => setPivotDate(pivotDate.subtract(1, mode.toLowerCase() as any))} style={styles.navBtn}>
                <MaterialIcon name="chevron-left" size={28} color={colors.primary} />
              </TouchableOpacity>
              <Text style={styles.navLabel}>{dateLabel}</Text>
              <TouchableOpacity onPress={() => setPivotDate(pivotDate.add(1, mode.toLowerCase() as any))} style={styles.navBtn}>
                <MaterialIcon name="chevron-right" size={28} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          {mode === 'Custom' && (
            <View style={styles.customRow}>
              <Pressable style={styles.dateInput} onPress={() => setShowStartPicker(true)}>
                <Text style={styles.inputHint}>From</Text>
                <Text style={styles.inputText}>{dayjs(customStart).format('DD MMM YY')}</Text>
              </Pressable>
              <MaterialIcon name="arrow-forward" size={20} color={colors.muted} />
              <Pressable style={styles.dateInput} onPress={() => setShowEndPicker(true)}>
                <Text style={styles.inputHint}>To</Text>
                <Text style={styles.inputText}>{dayjs(customEnd).format('DD MMM YY')}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.foundBadge}>
            <MaterialIcon name="info-outline" size={14} color={colors.primary} />
            <Text style={styles.foundText}>Found {count} transactions</Text>
          </View>
        </View>

        {/* 2. FORMAT OPTIONS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>2. Output Format</Text>
          <View style={styles.formatRow}>
            {(['pdf', 'csv', 'json'] as const).map((f) => (
              <TouchableOpacity 
                key={f} 
                style={[styles.formatBtn, format === f && styles.formatBtnActive]} 
                onPress={() => setFormat(f)}
              >
                <MaterialIcon 
                  name={f === 'pdf' ? 'picture-as-pdf' : f === 'csv' ? 'table-view' : 'code'} 
                  size={22} 
                  color={format === f ? colors.primary : '#94A3B8'} 
                />
                <Text style={[styles.formatBtnText, format === f && styles.formatBtnTextActive]}>{f.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.optionList}>
            <TouchableOpacity style={styles.optionRow} onPress={() => setIncludeNotes(!includeNotes)}>
              <MaterialIcon name={includeNotes ? 'check-box' : 'check-box-outline-blank'} size={24} color={colors.primary} />
              <Text style={styles.optionText}>Include transaction notes</Text>
            </TouchableOpacity>

            {format === 'pdf' && (
              <TouchableOpacity style={styles.optionRow} onPress={() => setGroupBy(groupBy === 'category' ? 'date' : 'category')}>
                <MaterialIcon name={groupBy === 'category' ? 'check-box' : 'check-box-outline-blank'} size={24} color={colors.primary} />
                <Text style={styles.optionText}>Group by category in PDF</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Button
          title={exporting ? "Generating..." : "Export & Share"}
          buttonStyle={styles.mainExportBtn}
          onPress={handleExport}
          disabled={count === 0}
          icon={<MaterialIcon name="share" size={20} color="white" style={{marginRight: 10}} />}
        />

        {showStartPicker && <DateTimePicker value={customStart} mode="date" onChange={(_, d) => { setShowStartPicker(false); if(d) setCustomStart(d); }} />}
        {showEndPicker && <DateTimePicker value={customEnd} mode="date" onChange={(_, d) => { setShowEndPicker(false); if(d) setCustomEnd(d); }} />}
      </ScrollView>
      <FullScreenSpinner visible={exporting} message="Processing Dataset..." />
    </SafeAreaView>
  );
};

const FILTERS = ['Today', 'Daily', 'Weekly', 'Monthly', 'Custom', 'All'];

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F1F5F9' },
  scrollContent: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 20,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: colors.primary, // Fixed: Use theme primary color
    borderColor: colors.primary,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  chipTextActive: { color: '#fff' },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 16,
  },
  navLabel: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  navBtn: { padding: 8, backgroundColor: '#fff', borderRadius: 12, elevation: 2 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateInput: {
    flex: 1,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inputHint: { fontSize: 10, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase' },
  inputText: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  foundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    backgroundColor: '#F0F9FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  foundText: { fontSize: 12, fontWeight: '700', color: colors.primary, marginLeft: 6 },
  formatRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  formatBtn: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  formatBtnActive: { borderColor: colors.primary, backgroundColor: '#F0F9FF' },
  formatBtnText: { fontSize: 12, fontWeight: '800', color: '#94A3B8', marginTop: 8 },
  formatBtnTextActive: { color: colors.primary },
  optionList: { gap: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 15 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  mainExportBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 18,
    elevation: 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
});

export default ExportScreen;