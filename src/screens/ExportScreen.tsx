import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@rneui/themed';
import dayjs from 'dayjs';
import ScreenHeader from '../components/ScreenHeader';
import { useEntries } from '../hooks/useEntries';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../utils/design';
import MaterialIcon from '@expo/vector-icons/MaterialIcons';
import { exportEntriesAsCsv, exportEntriesAsPdf } from '../utils/reportExporter';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { LocalEntry } from '../types/entries';

const ExportScreen = () => {
  const { user } = useAuth();
  const { entries = [] } = useEntries(user?.uid);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | 'json' | null>(null);
  const [mode, setMode] = useState<'Day' | 'Week' | 'Month' | 'Year' | 'Custom' | 'All'>('Day');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [groupBy, setGroupBy] = useState<'none' | 'category' | 'date'>('none');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [format, setFormat] = useState<'pdf' | 'csv' | 'json'>('pdf');

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    (entries as LocalEntry[]).forEach((e) => {
      const d = dayjs(e.date || e.created_at).format('YYYY-MM-DD');
      if (d) set.add(d);
    });
    return Array.from(set).sort().reverse();
  }, [entries]);

  const filteredForDate = (date: string | null) => {
    if (!date) return entries as LocalEntry[];
    return (entries as LocalEntry[]).filter(
      (e) => dayjs(e.date || e.created_at).format('YYYY-MM-DD') === date
    );
  };

  const getTargetEntries = () => {
    if (mode === 'All') return entries as LocalEntry[];
    if (mode === 'Day') return filteredForDate(selectedDate);
    if (mode === 'Week' && selectedDate) {
      const start = dayjs(selectedDate).startOf('week');
      const end = dayjs(selectedDate).endOf('week');
      return (entries as LocalEntry[]).filter((e) => {
        const d = dayjs(e.date || e.created_at);
        return !d.isBefore(start) && !d.isAfter(end);
      });
    }
    if (mode === 'Month' && selectedDate) {
      const m = dayjs(selectedDate).startOf('month');
      const end = m.endOf('month');
      return (entries as LocalEntry[]).filter((e) => {
        const d = dayjs(e.date || e.created_at);
        return !d.isBefore(m) && !d.isAfter(end);
      });
    }
    if (mode === 'Year' && selectedDate) {
      const y = dayjs(selectedDate).startOf('year');
      const end = y.endOf('year');
      return (entries as LocalEntry[]).filter((e) => {
        const d = dayjs(e.date || e.created_at);
        return !d.isBefore(y) && !d.isAfter(end);
      });
    }
    if (mode === 'Custom' && customStart && customEnd) {
      const s = dayjs(customStart).startOf('day');
      const e = dayjs(customEnd).endOf('day');
      if (!s.isValid() || !e.isValid()) return [] as LocalEntry[];
      return (entries as LocalEntry[]).filter((ent) => {
        const d = dayjs(ent.date || ent.created_at);
        return !d.isBefore(s) && !d.isAfter(e);
      });
    }
    return [] as LocalEntry[];
  };

  const handleExport = async (fmt: 'pdf' | 'csv' | 'json') => {
    const target = getTargetEntries();
    if (!target.length) {
      Alert.alert('No entries', 'There are no entries for the selected range.');
      return;
    }

    const summary = {
      totalIn: target.reduce((s, e) => s + (e.type === 'in' ? Number(e.amount || 0) : 0), 0),
      totalOut: target.reduce((s, e) => s + (e.type === 'out' ? Number(e.amount || 0) : 0), 0),
      net:
        target.reduce((s, e) => s + (e.type === 'in' ? Number(e.amount || 0) : 0), 0) -
        target.reduce((s, e) => s + (e.type === 'out' ? Number(e.amount || 0) : 0), 0),
      currencySymbol: '₹',
      filterLabel:
        mode === 'All' ? 'All entries' : mode === 'Custom' ? `${customStart} → ${customEnd}` : mode,
    };

    const metadata = {
      title: `DhanDiary Export (${groupBy !== 'none' ? `group:${groupBy}` : 'entries'})`,
      rangeLabel: summary.filterLabel,
      generatedAt: dayjs().format('DD MMM YYYY, HH:mm'),
    };

    try {
      setExporting(fmt as any);
      if (fmt === 'pdf') {
        await exportEntriesAsPdf(target, summary as any, metadata as any);
      } else if (fmt === 'csv') {
        await exportEntriesAsCsv(target, metadata as any);
      } else {
        // JSON export
        const payload = target.map((e) => (includeNotes ? e : { ...e, note: undefined }));
        const fileName = `dhandiary_export_${dayjs().format('YYYYMMDD_HHmmss')}.json`;
        const fileUri = `${FileSystem.cacheDirectory || ''}${fileName}`;
        await FileSystem.writeAsStringAsync(
          fileUri,
          JSON.stringify({ metadata, summary, data: payload }, null, 2),
          {
            encoding: FileSystem.EncodingType.UTF8,
          }
        );
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Share JSON Export',
        });
      }
      Alert.alert('Export ready', 'Report shared successfully.');
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'Unable to share report.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScreenHeader title="Export" subtitle="Generate professional reports" />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Export Options</Text>
          <Text style={styles.cardSubtitle}>Choose range, format and options</Text>

          <View style={{ marginTop: 12, marginBottom: 8 }}>
            <Text style={styles.labelMutedSmall}>Mode</Text>
            <View style={styles.chipsRow}>
              {['Day', 'Week', 'Month', 'Year', 'Custom', 'All'].map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, mode === m && styles.chipActive]}
                  onPress={() => setMode(m as any)}
                >
                  <Text style={[styles.chipText, mode === m && styles.chipTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>

            {mode !== 'All' && mode !== 'Custom' && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.labelMutedSmall}>Select reference date</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingVertical: 8 }}
                >
                  {availableDates.slice(0, 30).map((d) => (
                    <Pressable
                      key={d}
                      style={[styles.chip, selectedDate === d && styles.chipActive]}
                      onPress={() => setSelectedDate(d)}
                    >
                      <Text style={[styles.chipText, selectedDate === d && styles.chipTextActive]}>
                        {dayjs(d).format('DD MMM')}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {mode === 'Custom' && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.labelMutedSmall}>Custom range (YYYY-MM-DD)</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    placeholder="Start"
                    value={customStart}
                    onChangeText={setCustomStart}
                    style={[styles.chip, { flex: 1 }]}
                  />
                  <TextInput
                    placeholder="End"
                    value={customEnd}
                    onChangeText={setCustomEnd}
                    style={[styles.chip, { flex: 1 }]}
                  />
                </View>
              </View>
            )}

            <View style={{ marginTop: 12 }}>
              <Text style={styles.labelMutedSmall}>Format</Text>
              <View style={styles.reportActions}>
                <Pressable
                  style={[styles.chip, format === 'pdf' && styles.chipActive]}
                  onPress={() => setFormat('pdf')}
                >
                  <Text style={[styles.chipText, format === 'pdf' && styles.chipTextActive]}>
                    PDF
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, format === 'csv' && styles.chipActive]}
                  onPress={() => setFormat('csv')}
                >
                  <Text style={[styles.chipText, format === 'csv' && styles.chipTextActive]}>
                    CSV
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, format === 'json' && styles.chipActive]}
                  onPress={() => setFormat('json')}
                >
                  <Text style={[styles.chipText, format === 'json' && styles.chipTextActive]}>
                    JSON
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.labelMutedSmall}>Options</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <Pressable
                  style={[styles.chip, includeNotes && styles.chipActive]}
                  onPress={() => setIncludeNotes((v) => !v)}
                >
                  <Text style={[styles.chipText, includeNotes && styles.chipTextActive]}>
                    {includeNotes ? 'Include notes' : 'Exclude notes'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, groupBy === 'none' && styles.chipActive]}
                  onPress={() => setGroupBy('none')}
                >
                  <Text style={[styles.chipText, groupBy === 'none' && styles.chipTextActive]}>
                    No Group
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, groupBy === 'category' && styles.chipActive]}
                  onPress={() => setGroupBy('category')}
                >
                  <Text style={[styles.chipText, groupBy === 'category' && styles.chipTextActive]}>
                    Group by Category
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.actionBtn, styles.primaryBtn]}
                onPress={() => handleExport(format)}
                disabled={!!exporting}
              >
                <MaterialIcon name="file-upload" size={18} color="#fff" />
                <Text style={styles.actionText}>Export</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ExportScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9FC' },
  container: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  cardSubtitle: { color: '#90A4AE', marginBottom: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: '#546E7A', fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtn: { backgroundColor: colors.primary },
  secondaryBtn: { backgroundColor: '#E8F0FF' },
  actionText: { fontWeight: '800', color: '#fff' },
});
