import React, { useMemo, useState } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  Pressable, 
  Alert, 
  Platform, 
  TouchableOpacity, 
  UIManager,
  LayoutAnimation
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

// --- DAYJS CONFIGURATION ---
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';

// Extend dayjs with required plugins
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

// Fix for LayoutAnimation warning on Android
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
  
  // Pivot Date (Used for Day, Week, Month navigation)
  const [pivotDate, setPivotDate] = useState(dayjs());
  
  // Custom Range State
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Options
  const [format, setFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'date'>('date');

  // --- ACTIONS ---

  const handleModeChange = (newMode: Mode) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(newMode);
    // Reset pivot to today when switching modes for better UX
    if (newMode === 'Today') {
      setPivotDate(dayjs());
    }
  };

  const handlePrev = () => {
    if (mode === 'Day') setPivotDate(pivotDate.subtract(1, 'day'));
    else if (mode === 'Week') setPivotDate(pivotDate.subtract(1, 'week'));
    else if (mode === 'Month') setPivotDate(pivotDate.subtract(1, 'month'));
  };

  const handleNext = () => {
    if (mode === 'Day') setPivotDate(pivotDate.add(1, 'day'));
    else if (mode === 'Week') setPivotDate(pivotDate.add(1, 'week'));
    else if (mode === 'Month') setPivotDate(pivotDate.add(1, 'month'));
  };

  // --- DATA PROCESSING ---

  const dateLabel = useMemo(() => {
    if (mode === 'Day') return pivotDate.format('DD MMM YYYY');
    if (mode === 'Month') return pivotDate.format('MMMM YYYY');
    if (mode === 'Week') {
      const start = pivotDate.startOf('week');
      const end = pivotDate.endOf('week');
      // If same month: "12 - 18 Nov"
      if (start.month() === end.month()) return `${start.format('DD')} - ${end.format('DD MMM')}`;
      // Diff month: "29 Oct - 04 Nov"
      return `${start.format('DD MMM')} - ${end.format('DD MMM')}`;
    }
    return '';
  }, [mode, pivotDate]);

  const targetEntries = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    
    let filtered = [...entries];

    if (mode === 'Today') {
      const today = dayjs();
      filtered = filtered.filter(e => dayjs(e.date || e.created_at).isSame(today, 'day'));
    } 
    else if (mode === 'Day') {
      filtered = filtered.filter(e => dayjs(e.date || e.created_at).isSame(pivotDate, 'day'));
    } 
    else if (mode === 'Week') {
      const start = pivotDate.startOf('week');
      const end = pivotDate.endOf('week');
      filtered = filtered.filter(e => {
        const d = dayjs(e.date || e.created_at);
        return d.isAfter(start.subtract(1, 'second')) && d.isBefore(end.add(1, 'second'));
      });
    } 
    else if (mode === 'Month') {
      const start = pivotDate.startOf('month');
      const end = pivotDate.endOf('month');
      filtered = filtered.filter(e => {
        const d = dayjs(e.date || e.created_at);
        return d.isAfter(start.subtract(1, 'second')) && d.isBefore(end.add(1, 'second'));
      });
    } 
    else if (mode === 'Custom') {
      const s = dayjs(customStart).startOf('day');
      const e = dayjs(customEnd).endOf('day');
      filtered = filtered.filter(ent => {
        const d = dayjs(ent.date || ent.created_at);
        return d.isAfter(s.subtract(1, 'second')) && d.isBefore(e.add(1, 'second'));
      });
    }
    
    // Sort by date descending
    return filtered.sort((a, b) => dayjs(b.date || b.created_at).valueOf() - dayjs(a.date || a.created_at).valueOf());
  }, [entries, mode, pivotDate, customStart, customEnd]);

  // --- EXPORT ---
  const handleExport = async () => {
    if (targetEntries.length === 0) {
      return Alert.alert('No Data', 'There are no transactions to export for the selected range.');
    }

    setExporting(true);
    try {
      const title = `Report_${dayjs().format('YYYY-MM-DD_HHmm')}`;
      
      // Prepare data
      const dataToExport = includeNotes 
        ? targetEntries 
        : targetEntries.map(({ note, ...rest }: any) => rest);

      let periodLabel = 'All Time';
      if (mode === 'Custom') periodLabel = `${dayjs(customStart).format('DD MMM')} - ${dayjs(customEnd).format('DD MMM')}`;
      else if (mode === 'Today') periodLabel = `Today (${dayjs().format('DD MMM')})`;
      else if (['Day', 'Week', 'Month'].includes(mode)) periodLabel = dateLabel;

      const filePath = await exportToFile(format, dataToExport, {
        title,
        periodLabel,
        groupBy
      });

      if (filePath) {
        await shareFile(filePath);
      } else {
        throw new Error('File generation failed');
      }
    } catch (error: any) {
      Alert.alert('Export Failed', error.message || 'Unknown error occurred');
    } finally {
      setExporting(false);
    }
  };

  // --- RENDER HELPERS ---
  const renderChip = (label: string, value: Mode) => (
    <Pressable
      key={value}
      style={[styles.chip, mode === value && styles.chipActive]}
      onPress={() => handleModeChange(value)}
    >
      <Text style={[styles.chipText, mode === value && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader title="Export Data" subtitle="Download reports & backup" />
      
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        {/* SECTION 1: RANGE SELECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Select Range</Text>
          
          <View style={styles.chipRow}>
            {renderChip('Today', 'Today')}
            {renderChip('Daily', 'Day')}
            {renderChip('Weekly', 'Week')}
            {renderChip('Monthly', 'Month')}
            {renderChip('Custom', 'Custom')}
            {renderChip('All', 'All')}
          </View>

          {/* DYNAMIC DATE NAVIGATOR (For Day, Week, Month) */}
          {['Day', 'Week', 'Month'].includes(mode) && (
             <View style={styles.dateControl}>
                <TouchableOpacity onPress={handlePrev} style={styles.arrowBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                   <MaterialIcon name="chevron-left" size={26} color={colors.text} />
                </TouchableOpacity>
                
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.dateLabel}>{dateLabel}</Text>
                  {mode === 'Week' && <Text style={styles.subLabel}>Week {pivotDate.week()}</Text>}
                </View>

                <TouchableOpacity onPress={handleNext} style={styles.arrowBtn} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                   <MaterialIcon name="chevron-right" size={26} color={colors.text} />
                </TouchableOpacity>
             </View>
          )}

          {/* CUSTOM PICKERS */}
          {mode === 'Custom' && (
            <View style={styles.customRangeRow}>
               <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowStartPicker(true)}>
                  <Text style={styles.datePickerLabel}>Start</Text>
                  <Text style={styles.datePickerValue}>{dayjs(customStart).format('DD MMM YYYY')}</Text>
                  <MaterialIcon name="event" size={18} color={colors.primary} style={{position:'absolute', right:10, top: 12}}/>
               </TouchableOpacity>
               <MaterialIcon name="arrow-forward" size={20} color={colors.muted} />
               <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowEndPicker(true)}>
                  <Text style={styles.datePickerLabel}>End</Text>
                  <Text style={styles.datePickerValue}>{dayjs(customEnd).format('DD MMM YYYY')}</Text>
                  <MaterialIcon name="event" size={18} color={colors.primary} style={{position:'absolute', right:10, top: 12}}/>
               </TouchableOpacity>
            </View>
          )}
          
          <View style={styles.summaryContainer}>
             <MaterialIcon name="analytics" size={16} color={colors.primary} />
             <Text style={styles.summaryText}>
               Found <Text style={{fontWeight:'800', color: colors.text}}>{targetEntries.length}</Text> records
             </Text>
          </View>
        </View>

        {/* SECTION 2: FORMAT OPTIONS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Format & Options</Text>
          
          <View style={styles.formatRow}>
             {['pdf', 'csv', 'json'].map((f) => (
                <Pressable 
                  key={f} 
                  style={[styles.formatBtn, format === f && styles.formatBtnActive]}
                  onPress={() => setFormat(f as any)}
                >
                   <MaterialIcon 
                      name={f === 'pdf' ? 'picture-as-pdf' : f === 'csv' ? 'table-view' : 'code'} 
                      size={20} 
                      color={format === f ? colors.primary : colors.muted} 
                   />
                   <Text style={[styles.formatText, format === f && styles.formatTextActive]}>
                      {f.toUpperCase()}
                   </Text>
                </Pressable>
             ))}
          </View>

          <View style={styles.optionsContainer}>
             <Pressable style={styles.checkboxRow} onPress={() => setIncludeNotes(!includeNotes)}>
                <MaterialIcon name={includeNotes ? "check-box" : "check-box-outline-blank"} size={22} color={colors.primary} />
                <Text style={styles.checkboxLabel}>Include Notes</Text>
             </Pressable>
             
             {format === 'pdf' && (
               <Pressable style={styles.checkboxRow} onPress={() => setGroupBy(groupBy === 'category' ? 'date' : 'category')}>
                  <MaterialIcon name={groupBy === 'category' ? "check-box" : "check-box-outline-blank"} size={22} color={colors.primary} />
                  <Text style={styles.checkboxLabel}>Group by Category</Text>
               </Pressable>
             )}
          </View>
        </View>

        {/* EXPORT BUTTON */}
        <Button
          title={exporting ? "Generating Report..." : `Export ${format.toUpperCase()}`}
          onPress={handleExport}
          disabled={exporting || targetEntries.length === 0}
          loading={exporting}
          buttonStyle={styles.exportBtn}
          containerStyle={{ marginTop: 10, marginBottom: 40 }}
          titleStyle={{ fontWeight: '700', fontSize: 16 }}
          icon={!exporting ? <MaterialIcon name="file-download" size={20} color="white" style={{marginRight:8}} /> : undefined}
        />

        {/* HIDDEN PICKERS */}
        {showStartPicker && (
          <DateTimePicker
            value={customStart}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, date) => {
              setShowStartPicker(false);
              if (date) setCustomStart(date);
            }}
          />
        )}
        {showEndPicker && (
          <DateTimePicker
            value={customEnd}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, date) => {
              setShowEndPicker(false);
              if (date) setCustomEnd(date);
            }}
          />
        )}

      </ScrollView>
      <FullScreenSpinner visible={exporting} message="Generating Report..." />
    </SafeAreaView>
  );
};

export default ExportScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { padding: 16 },
  
  section: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  
  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: colors.text, // Dark active state
    borderColor: colors.text,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  chipTextActive: {
    color: '#fff',
  },

  // Date Navigator
  dateControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  arrowBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  subLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
  },

  // Custom Range
  customRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 12,
  },
  datePickerBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12,
    position: 'relative',
  },
  datePickerLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  datePickerValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },

  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 6,
  },
  summaryText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },

  // Format
  formatRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  formatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  formatBtnActive: {
    backgroundColor: '#F0F9FF',
    borderColor: colors.primary,
  },
  formatText: {
    fontWeight: '700',
    color: '#64748B',
    fontSize: 13,
  },
  formatTextActive: {
    color: colors.primary,
  },

  optionsContainer: {
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },

  exportBtn: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    elevation: 3,
    shadowColor: colors.primary,
    shadowOffset: {width:0, height:4},
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
});