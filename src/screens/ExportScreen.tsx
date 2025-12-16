import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@rneui/themed';
import dayjs from 'dayjs';
import ScreenHeader from '../components/ScreenHeader';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing } from '../utils/design';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { exportToFile, shareFile } from '../utils/reportExporter';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LocalEntry } from '../types/entries';
import FullScreenSpinner from '../components/FullScreenSpinner';

const ExportScreen = () => {
  const { user } = useAuth();
  const { entries = [] } = useEntries(user?.uid);
  
  // State
  const [exporting, setExporting] = useState(false);
  const [mode, setMode] = useState<'Day' | 'Week' | 'Month' | 'Custom' | 'All'>('Month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Custom Range State
  const [customStart, setCustomStart] = useState(new Date());
  const [customEnd, setCustomEnd] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Options
  const [format, setFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'date'>('date');

  // --- FILTER LOGIC ---
  const targetEntries = useMemo(() => {
    if (!entries || entries.length === 0) return [];
    
    let filtered = [...entries];
    const targetDate = dayjs(selectedDate);

    if (mode === 'Day') {
      filtered = filtered.filter(e => dayjs(e.date).isSame(targetDate, 'day'));
    } else if (mode === 'Week') {
      const start = targetDate.startOf('week');
      const end = targetDate.endOf('week');
      filtered = filtered.filter(e => {
        const d = dayjs(e.date);
        return d.isAfter(start.subtract(1, 'ms')) && d.isBefore(end.add(1, 'ms'));
      });
    } else if (mode === 'Month') {
      const start = targetDate.startOf('month');
      const end = targetDate.endOf('month');
      filtered = filtered.filter(e => {
        const d = dayjs(e.date);
        return d.isAfter(start.subtract(1, 'ms')) && d.isBefore(end.add(1, 'ms'));
      });
    } else if (mode === 'Custom') {
      const s = dayjs(customStart).startOf('day');
      const e = dayjs(customEnd).endOf('day');
      filtered = filtered.filter(ent => {
        const d = dayjs(ent.date);
        return d.isAfter(s.subtract(1, 'ms')) && d.isBefore(e.add(1, 'ms'));
      });
    }
    
    // Sort by date descending
    return filtered.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
  }, [entries, mode, selectedDate, customStart, customEnd]);

  // --- EXPORT HANDLER ---
  const handleExport = async () => {
    if (targetEntries.length === 0) {
      return Alert.alert('No Data', 'There are no transactions to export for the selected range.');
    }

    setExporting(true);
    try {
      const title = `DhanDiary_Report_${dayjs().format('YYYYMMDD_HHmm')}`;
      
      // Prepare data
      const dataToExport = includeNotes 
        ? targetEntries 
        : targetEntries.map(({ note, ...rest }) => rest);

      // Generate File
      const filePath = await exportToFile(format, dataToExport, {
        title,
        periodLabel: mode === 'Custom' 
          ? `${dayjs(customStart).format('DD MMM')} - ${dayjs(customEnd).format('DD MMM')}`
          : mode === 'All' ? 'All Time' : dayjs(selectedDate).format('MMMM YYYY'),
        groupBy
      });

      // Share
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
  const renderOption = (label: string, isSelected: boolean, onPress: () => void) => (
    <Pressable
      style={[styles.chip, isSelected && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader title="Export Data" subtitle="Download reports & backup" />
      
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        {/* SECTION 1: RANGE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Select Range</Text>
          <View style={styles.chipRow}>
            {['Week', 'Month', 'Custom', 'All'].map(m => (
              <View key={m} style={styles.chipWrapper}>
                {renderOption(m, mode === m, () => setMode(m as any))}
              </View>
            ))}
          </View>

          {/* Date Pickers based on Mode */}
          {mode === 'Month' && (
             <View style={styles.dateControl}>
                <TouchableOpacity onPress={() => setSelectedDate(dayjs(selectedDate).subtract(1, 'month').toDate())} style={styles.arrowBtn}>
                   <MaterialIcon name="chevron-left" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.dateLabel}>{dayjs(selectedDate).format('MMMM YYYY')}</Text>
                <TouchableOpacity onPress={() => setSelectedDate(dayjs(selectedDate).add(1, 'month').toDate())} style={styles.arrowBtn}>
                   <MaterialIcon name="chevron-right" size={24} color={colors.text} />
                </TouchableOpacity>
             </View>
          )}

          {mode === 'Custom' && (
            <View style={styles.customRangeRow}>
               <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowStartPicker(true)}>
                  <Text style={styles.datePickerLabel}>Start</Text>
                  <Text style={styles.datePickerValue}>{dayjs(customStart).format('DD MMM YYYY')}</Text>
               </TouchableOpacity>
               <MaterialIcon name="arrow-forward" size={20} color={colors.muted} />
               <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowEndPicker(true)}>
                  <Text style={styles.datePickerLabel}>End</Text>
                  <Text style={styles.datePickerValue}>{dayjs(customEnd).format('DD MMM YYYY')}</Text>
               </TouchableOpacity>
            </View>
          )}
          
          <Text style={styles.summaryText}>
             Found <Text style={{fontWeight:'700', color: colors.primary}}>{targetEntries.length}</Text> records
          </Text>
        </View>

        {/* SECTION 2: FORMAT */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Format & Options</Text>
           <View style={styles.chipRow}>
             <View style={styles.chipWrapper}>{renderOption('PDF Report', format === 'pdf', () => setFormat('pdf'))}</View>
             <View style={styles.chipWrapper}>{renderOption('Excel (CSV)', format === 'csv', () => setFormat('csv'))}</View>
             <View style={styles.chipWrapper}>{renderOption('JSON', format === 'json', () => setFormat('json'))}</View>
           </View>

          <View style={styles.optionsRow}>
             <Pressable style={styles.checkboxRow} onPress={() => setIncludeNotes(!includeNotes)}>
                <MaterialIcon name={includeNotes ? "check-box" : "check-box-outline-blank"} size={24} color={colors.primary} />
                <Text style={styles.checkboxLabel}>Include Notes</Text>
             </Pressable>
             
             {format === 'pdf' && (
               <Pressable style={styles.checkboxRow} onPress={() => setGroupBy(groupBy === 'category' ? 'date' : 'category')}>
                  <MaterialIcon name={groupBy === 'category' ? "check-box" : "check-box-outline-blank"} size={24} color={colors.primary} />
                  <Text style={styles.checkboxLabel}>Group by Category</Text>
               </Pressable>
             )}
          </View>
        </View>

        {/* ACTION */}
        <Button
          title={exporting ? "Generating..." : `Export ${format.toUpperCase()}`}
          onPress={handleExport}
          disabled={exporting || targetEntries.length === 0}
          loading={exporting}
          buttonStyle={styles.exportBtn}
          containerStyle={{ marginTop: 20 }}
          icon={<MaterialIcon name="file-download" size={20} color="white" style={{marginRight:8}} />}
        />

        {/* Pickers */}
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
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  chipWrapper: {
    marginRight: 8,
    marginBottom: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  chipTextActive: {
    color: '#fff',
  },

  // Date Control
  dateControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  arrowBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },

  // Custom Range
  customRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  datePickerBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
  },
  datePickerLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  datePickerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },

  summaryText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
    textAlign: 'right',
  },

  // Options
  optionsRow: {
    marginTop: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#334155',
  },

  exportBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
});