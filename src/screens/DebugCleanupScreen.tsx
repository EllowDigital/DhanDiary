import React, { useState } from 'react';
import { View, Button, ScrollView, Text } from 'react-native';
import { cleanupDuplicateLocalEntries } from '../utils/cleanupDuplicates';

const DebugCleanupScreen: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const run = async (dry = true) => {
    setRunning(true);
    try {
      const r = await cleanupDuplicateLocalEntries({ dryRun: dry });
      setReport({ dry, ...r });
    } catch (e) {
      setReport({ error: String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={{ marginBottom: 12 }}>
        <Button
          title={running ? 'Running...' : 'Run dry-run cleanup'}
          disabled={running}
          onPress={() => run(true)}
        />
      </View>
      <View style={{ marginBottom: 12 }}>
        <Button
          title={running ? 'Running...' : 'Run destructive cleanup'}
          disabled={running}
          onPress={() => run(false)}
        />
      </View>
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontWeight: '700', marginBottom: 8 }}>Report</Text>
        <Text>{report ? JSON.stringify(report, null, 2) : 'No report yet'}</Text>
      </View>
    </ScrollView>
  );
};

export default DebugCleanupScreen;
